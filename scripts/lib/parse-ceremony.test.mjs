import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ceremonyNumberForYear,
  pageTitleForYear,
  stripMarkup,
  splitNames,
  parseNominationLine,
  parseCeremony,
} from './parse-ceremony.mjs';

// Each of these locks in a bug the dry run actually surfaced against the live
// archive, so a regression shows up as a failing test rather than as 150
// spurious changes to 97 years of data.

test('ceremony numbering handles the irregular early years', () => {
  // Two ceremonies were held in 1930 and none in 1933, so no single offset works.
  assert.equal(ceremonyNumberForYear(1929), 1);
  assert.equal(ceremonyNumberForYear(1930), 2);
  assert.equal(ceremonyNumberForYear(1931), 4);
  assert.equal(ceremonyNumberForYear(1932), 5);
  assert.equal(ceremonyNumberForYear(1934), 6);
  // The original off-by-one sent 2026 to the 97th ceremony's page.
  assert.equal(ceremonyNumberForYear(2026), 98);
  assert.equal(pageTitleForYear(2026), '98th_Academy_Awards');
  assert.throws(() => ceremonyNumberForYear(1933), /No ceremony/);
});

test('interlanguage-link templates keep the name inside them', () => {
  // Dropping the whole template deleted the nominee and left a stray "and".
  assert.equal(
    stripMarkup("{{ill|Sara Khaki|de}} and [[Mohammadreza Eyni]]"),
    'Sara Khaki and Mohammadreza Eyni',
  );
});

test('wikilinks resolve to their display text', () => {
  assert.equal(stripMarkup("''[[Sinners (2025 film)|Sinners]]''"), 'Sinners');
  assert.equal(stripMarkup('[[Adam Somner]]'), 'Adam Somner');
});

test('splitNames drops role descriptors and de-duplicates', () => {
  assert.deepEqual(splitNames('[[Adam Somner]], [[Sara Murphy]], and [[Paul Thomas Anderson]], producers'), [
    'Adam Somner',
    'Sara Murphy',
    'Paul Thomas Anderson',
  ]);
  // "Music by Nick Cave and Bryce Dessner; lyrics by Nick Cave" named one person twice.
  assert.deepEqual(splitNames('Music by Nick Cave and Bryce Dessner; lyrics by Nick Cave'), [
    'Nick Cave',
    'Bryce Dessner',
  ]);
  assert.deepEqual(splitNames('Production Design: Tamara Deverell; Set Decoration: Shane Vieau'), [
    'Tamara Deverell',
    'Shane Vieau',
  ]);
});

test('Best Picture puts the film first and the producers second', () => {
  const line =
    "* '''''[[One Battle After Another]]'' \u2013 [[Adam Somner]], [[Sara Murphy]], and [[Paul Thomas Anderson]], producers \u2021'''";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.primary, ['One Battle After Another']);
  assert.deepEqual(nomination.secondary, ['Adam Somner', 'Sara Murphy', 'Paul Thomas Anderson']);
  assert.equal(nomination.won, true);
});

test('acting puts the performer first and the film second', () => {
  const line =
    "* '''[[Michael B. Jordan]] \u2013 ''[[Sinners (2025 film)|Sinners]]'' as Elijah \"Smoke\" Moore \u2021'''";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.primary, ['Michael B. Jordan']);
  assert.deepEqual(nomination.secondary, ['Sinners']);
  assert.equal(nomination.won, true);
  assert.match(nomination.notes, /as Elijah/);
});

test('film titles containing "and" are never split', () => {
  // "The Life and Death of Brent Renaud" was becoming "The Life, Death of".
  const line =
    "** ''[[Armed Only with a Camera: The Life and Death of Brent Renaud]]'' \u2013 [[Craig Renaud]]";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.primary, [
    'Armed Only with a Camera: The Life and Death of Brent Renaud',
  ]);
});

test('a nominee without the dagger is not a winner', () => {
  const { nomination } = parseNominationLine("** ''[[Bugonia (film)|Bugonia]]'' \u2013 [[Ed Guiney]], producer");
  assert.equal(nomination.won, false);
});

test('Original Song keys on the film and notes the song', () => {
  const line =
    "* '''\"[[Golden (Huntrix song)|Golden]]\" from ''[[KPop Demon Hunters]]'' \u2013 Music and lyrics by [[Ejae]] and [[Teddy Park]] \u2021'''";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.primary, ['KPop Demon Hunters']);
  assert.deepEqual(nomination.secondary, ['Ejae', 'Teddy Park']);
  assert.match(nomination.notes, /song: Golden/);
});

test('International Feature keeps only the film', () => {
  const line =
    "* '''''[[Sentimental Value]]'' (Norway) in Norwegian and English \u2013 directed by [[Joachim Trier]] \u2021'''";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.primary, ['Sentimental Value']);
  assert.deepEqual(nomination.secondary, []);
  assert.match(nomination.notes, /Norway/);
});

test('an adapted screenplay source becomes a note, not a nominee', () => {
  const line =
    "** ''[[Frankenstein (2025 film)|Frankenstein]]'' \u2013 [[Guillermo del Toro]]; based on the novel by [[Mary Shelley]]";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.secondary, ['Guillermo del Toro']);
  assert.match(nomination.notes, /based on the novel/);
});

test('collaborators who are not nominees become a note', () => {
  const line =
    "** ''[[It Was Just an Accident]]'' \u2013 [[Jafar Panahi]], in collaboration with Nader Sa\u00efvar";
  const { nomination } = parseNominationLine(line);
  assert.deepEqual(nomination.secondary, ['Jafar Panahi']);
  assert.match(nomination.notes, /in collaboration with/);
});

test('parsing stops at the end of the awards table', () => {
  // Without this the parser walked into the Honorary Awards section and
  // attributed its bullets to whichever category came last.
  const wikitext = [
    '{| class="wikitable defaulttop"',
    '| {{Award category|#F9EFAA|[[Academy Award for Best Picture|Best Picture]]}}',
    "* '''''[[A Film]]'' \u2013 [[A Producer]], producer \u2021'''",
    '|}',
    '',
    '=== Honorary Awards ===',
    '* [[Debbie Allen]]"A trailblazing choreographer"',
  ].join('\n');

  const { categories } = parseCeremony(wikitext);
  assert.equal(categories.length, 1);
  assert.equal(categories[0].nominations.length, 1);
  assert.deepEqual(categories[0].primary, undefined);
  assert.deepEqual(categories[0].nominations[0].primary, ['A Film']);
});

test('category names are translated to the archive spelling', () => {
  const wikitext = [
    '{| class="wikitable defaulttop"',
    '| {{Award category|#F9EFAA|[[Academy Award for Best Director|Best Directing]]}}',
    "* '''[[A Director]] \u2013 ''[[A Film]]'' \u2021'''",
    '|}',
  ].join('\n');

  const { categories, unmapped } = parseCeremony(wikitext);
  // Wikipedia says "Best Directing"; the archive has always said this.
  assert.equal(categories[0].category, 'Best Achievement in Directing');
  assert.deepEqual(unmapped, []);
});

test('an unrecognised category is reported rather than silently accepted', () => {
  const wikitext = [
    '{| class="wikitable defaulttop"',
    '| {{Award category|#F9EFAA|Best Stunt Design}}',
    "* '''[[Someone]] \u2013 ''[[A Film]]'' \u2021'''",
    '|}',
  ].join('\n');

  const { unmapped } = parseCeremony(wikitext);
  assert.deepEqual(unmapped, ['Best Stunt Design']);
});
