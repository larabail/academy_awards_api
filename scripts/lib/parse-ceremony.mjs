/**
 * Parses an Academy Awards ceremony from Wikipedia wikitext.
 *
 * Wikipedia is used rather than awardsdatabase.oscars.org because the official
 * database returns 403 to every non-browser client and renders through
 * JavaScript, while the Wikipedia Action API returns raw wikitext over a plain
 * GET with no auth, no cookies and no rendering. Wikipedia is also updated
 * within minutes of both the nominations and the ceremony.
 *
 * Kept free of I/O so it can be tested against fixtures.
 */

/**
 * Wikipedia and this dataset name the same award differently — Wikipedia says
 * "Best Directing" where the archive has said "Best Achievement in Directing"
 * since 1929. Rewriting 97 years of category names to match Wikipedia would
 * silently break every consumer calling /award/name=, so incoming names are
 * translated into the archive's spelling instead.
 */
export const CATEGORY_ALIASES = {
  'Best Directing': 'Best Achievement in Directing',
  'Best Actor in a Leading Role': 'Best Performance by an Actor in a Leading Role',
  'Best Actress in a Leading Role': 'Best Performance by an Actress in a Leading Role',
  'Best Actor in a Supporting Role': 'Best Performance by an Actor in a Supporting Role',
  'Best Actress in a Supporting Role': 'Best Performance by an Actress in a Supporting Role',
  'Best Writing (Original Screenplay)': 'Best Original Screenplay',
  'Best Writing (Adapted Screenplay)': 'Best Adapted Screenplay',
  'Best Documentary Feature Film': 'Best Documentary Feature',
  'Best Music (Original Score)':
    'Best Achievement in Music Written for Motion Pictures (Original Score)',
  'Best Music (Original Song)':
    'Best Achievement in Music Written for Motion Pictures (Original Song)',
  'Best Casting': 'Best Achievement in Casting',
  // Wikipedia has renamed the short film categories more than once.
  'Best Short Film (Live Action)': 'Best Live Action Short Film',
  'Best Short Film (Animated)': 'Best Animated Short Film',
  'Best Documentary (Feature)': 'Best Documentary Feature',
  'Best Documentary (Short Subject)': 'Best Documentary Short Film',
  'Best Production Design': 'Best Achievement in Production Design',
  'Best Cinematography': 'Best Achievement in Cinematography',
  'Best Makeup and Hairstyling': 'Best Achievement in Makeup and Hairstyling',
  'Best Costume Design': 'Best Achievement in Costume Design',
  'Best Film Editing': 'Best Achievement in Film Editing',
  'Best Visual Effects': 'Best Achievement in Visual Effects',
};

/** Categories whose Wikipedia name already matches the archive. */
const IDENTITY_CATEGORIES = new Set([
  'Best Picture',
  'Best Sound',
  'Best Animated Feature Film',
  'Best International Feature Film',
  'Best Animated Short Film',
  'Best Live Action Short Film',
  'Best Documentary Short Film',
]);

/** [[Target|Display]] -> Display, [[Target]] -> Target. */
export function resolveLinks(text) {
  return text.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_m, target, display) => display ?? target,
  );
}

/** Removes markup that carries no data: refs, templates, comments, formatting. */
export function stripMarkup(text) {
  return resolveLinks(
    text
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{abbr\|[^|]*\|([^}]*)\}\}/g, '$1')
      // {{ill|Sara Khaki|de}} links a person with no English article. Dropping
      // the whole template would silently delete the nominee.
      .replace(/\{\{ill\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1')
      .replace(/\{\{(?:nowrap|nobr)\|([^}]*)\}\}/gi, '$1')
      .replace(/\{\{[^{}]*\}\}/g, ''),
  )
    .replace(/'{2,5}/g, '')
    .replace(/[\u2021\u2020]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Role descriptors that label a list of people rather than naming anyone:
 * "Production Design: Tamara Deverell", "Music and lyrics by Ejae".
 */
const ROLE_PREFIX =
  /^\s*(production design|art direction|set decoration|music|lyrics?|screenplay|story|written|directed|adapted|teleplay|sound|visual effects|cinematography|film editing|costume design|makeup and hairstyling|casting)\b[^:]*?(?::|\bby\b)\s*/i;

const ROLE_SUFFIX =
  /,?\s+(producers?|screenplay by|story by|written by|music by|lyrics? by|directors?|casting directors?)\s*$/i;

/**
 * Splits "A, B, and C" into names.
 *
 * Only ever applied to the side of a nomination that holds people. Film titles
 * are kept whole, because titles contain both commas and "and" — splitting
 * "The Life and Death of Brent Renaud" produced two fragments rather than a
 * film.
 */
export function splitNames(text) {
  const cleaned = stripMarkup(text).replace(ROLE_PREFIX, '').replace(ROLE_SUFFIX, '');

  const parts = cleaned
    .split(/;\s*|,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/)
    .map((part) => part.replace(ROLE_PREFIX, '').replace(/\s*\([^)]*\)\s*$/, '').trim())
    .filter((part) => part && !/^(and|by)$/i.test(part));

  // "Music by Nick Cave and Bryce Dessner; lyrics by Nick Cave" names the same
  // person twice; the archive lists each nominee once.
  return [...new Set(parts)];
}

/** A film title is kept exactly as written, minus markup. */
export function cleanTitle(text) {
  return stripMarkup(text).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Parses one nomination line.
 *
 * Which side holds the film is decided by the italics in the source rather than
 * by guessing from the category: Wikipedia italicises film titles, so for Best
 * Picture the left side is italic and is the film, while for acting the right
 * side is italic and the left is the performer. That one rule covers every
 * category without a per-category lookup table.
 */
export function parseNominationLine(line) {
  const withoutBullets = line.replace(/^\*+\s*/, '');
  const won = /\u2021/.test(withoutBullets);

  const smallNote = withoutBullets.match(/<small>\s*\(?(.*?)\)?\s*<\/small>/);
  const body = withoutBullets.replace(/<small>[\s\S]*?<\/small>/g, '');

  // The en dash separates subject from context. Split on the first one only.
  const dash = body.search(/\s[\u2013\u2014]\s/);
  let leftRaw = dash === -1 ? body : body.slice(0, dash);
  let rightRaw = dash === -1 ? '' : body.slice(dash + 3);

  const notes = [];

  // "as Character" trails the film title and is not part of it.
  const asMatch = rightRaw.match(/''\s+as\s+(.+)$/);
  if (asMatch) {
    notes.push(`as ${stripMarkup(asMatch[1])}`);
    rightRaw = rightRaw.slice(0, asMatch.index + 2);
  }

  // Adapted Screenplay carries its source after a semicolon: "Writer; based on
  // the novel X". Only that phrasing is a note — elsewhere a semicolon just
  // separates people ("Production Design: A; Set Decoration: B"), and treating
  // it as a note silently dropped the second nominee.
  const basedOn = rightRaw.search(/;\s*(based on|from the)/i);
  if (basedOn !== -1) {
    notes.push(stripMarkup(rightRaw.slice(basedOn + 1)));
    rightRaw = rightRaw.slice(0, basedOn);
  }

  // "Writer, in collaboration with A, B" credits collaborators who are not
  // themselves nominees, so they belong in the note rather than the name list.
  const collaboration = rightRaw.search(/,?\s*in collaboration with\s+/i);
  if (collaboration !== -1) {
    notes.push(stripMarkup(rightRaw.slice(collaboration).replace(/^,\s*/, '')));
    rightRaw = rightRaw.slice(0, collaboration);
  }

  // Original Song reads: "Song Title" from ''Film''. The archive keys these on
  // the film, so the song title becomes a note. Bold markers are still present
  // at this point, hence the leading quote allowance.
  const song = leftRaw.match(/^[\s']*"(.+?)"\s+from\s+(.+)$/);
  if (song) {
    notes.push(`song: ${stripMarkup(song[1])}`);
    leftRaw = song[2];
  }

  // International Feature reads "Film (Country) in Language – directed by X".
  // The archive stores the film alone, so the rest becomes a note.
  const submission = leftRaw.match(/\s*\(([^)]+)\)\s*(?:in\s+(.+))?$/);
  const leftLooksLikeFilm = /''/.test(leftRaw.replace(/'''/g, "''"));
  if (submission && leftLooksLikeFilm) {
    const detail = [submission[1], submission[2] && `in ${stripMarkup(submission[2])}`]
      .filter(Boolean)
      .join(', ');
    if (detail) notes.push(detail);
    leftRaw = leftRaw.slice(0, submission.index);
  }

  const directedBy = rightRaw.match(/^\s*directed by\s+(.+)$/i);
  if (directedBy) {
    notes.push(`directed by ${stripMarkup(directedBy[1])}`);
    rightRaw = '';
  }

  const leftIsFilm = /''/.test(leftRaw.replace(/'''/g, "''"));

  if (smallNote && stripMarkup(smallNote[1])) notes.unshift(stripMarkup(smallNote[1]));

  // Whichever side is the film is kept whole; only the people side is split.
  const nomination = {
    primary: leftIsFilm ? [cleanTitle(leftRaw)].filter(Boolean) : splitNames(leftRaw),
    secondary: !rightRaw ? [] : leftIsFilm ? splitNames(rightRaw) : [cleanTitle(rightRaw)].filter(Boolean),
    won,
  };
  const note = notes.filter(Boolean).join('; ').trim();
  if (note) nomination.notes = note;

  return { nomination, leftIsFilm };
}

/** Parses a full ceremony page into the archive's category/nomination shape. */
export function parseCeremony(wikitext) {
  const lines = wikitext.split('\n');
  const categories = [];
  const unmapped = [];
  let current = null;
  let inTable = false;

  for (const line of lines) {
    // Only the competitive awards table is of interest. Without this the parser
    // walked on into the Honorary Awards section and attributed its bullets to
    // whichever category happened to be last.
    if (/^\{\|/.test(line)) {
      inTable = true;
      continue;
    }
    if (/^\|\}/.test(line)) {
      inTable = false;
      current = null;
      continue;
    }
    if (!inTable) continue;

    const header = line.match(/\{\{Award category\|[^|]*\|(.+?)\}\}\s*$/);
    if (header) {
      const rawName = stripMarkup(header[1]);
      const name = CATEGORY_ALIASES[rawName] ?? rawName;
      if (!CATEGORY_ALIASES[rawName] && !IDENTITY_CATEGORIES.has(rawName)) {
        unmapped.push(rawName);
      }
      current = { category: name, nominations: [] };
      categories.push(current);
      continue;
    }

    if (!current) continue;
    if (!/^\*+\s/.test(line)) continue;

    const { nomination } = parseNominationLine(line);
    if (nomination.primary.length) current.nominations.push(nomination);
  }

  return { categories, unmapped };
}

/**
 * Ceremony number for a ceremony year.
 *
 * The early years do not follow a formula: two ceremonies were held in 1930
 * (the 2nd in April and the 3rd in November), and none at all in 1933, when the
 * eligibility period was realigned to the calendar year. From 1934 the offset
 * is stable, so 2026 is the 98th. The archive stores one entry per year, so
 * 1930 maps to the 2nd.
 */
const EARLY_CEREMONIES = { 1929: 1, 1930: 2, 1931: 4, 1932: 5 };

export function ceremonyNumberForYear(year) {
  const n = Number(year);
  if (!Number.isInteger(n)) throw new Error(`Not a year: ${year}`);
  if (EARLY_CEREMONIES[n]) return EARLY_CEREMONIES[n];
  if (n === 1933) throw new Error('No ceremony was held in 1933');
  if (n < 1929) throw new Error(`No ceremony before 1929 (got ${n})`);
  return n - 1928;
}

export function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

export function pageTitleForYear(year) {
  return `${ordinal(ceremonyNumberForYear(year))}_Academy_Awards`;
}
