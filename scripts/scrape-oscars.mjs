#!/usr/bin/env node
/**
 * Refreshes a ceremony in the archive from Wikipedia.
 *
 * Dry run by default: it prints exactly what would change and writes nothing.
 * Pass --apply to write, which requires credentials.
 *
 *   node scripts/scrape-oscars.mjs --year 2026
 *   node scripts/scrape-oscars.mjs --url https://en.wikipedia.org/wiki/98th_Academy_Awards
 *   node scripts/scrape-oscars.mjs --year 2026 --apply
 */
import { parseCeremony, pageTitleForYear } from './lib/parse-ceremony.mjs';

const USER_AGENT = 'uractor-oscars-updater/1.0 (https://developer.uractor.com)';

function parseArgs(argv) {
  const args = { apply: false, year: null, url: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--year') args.year = argv[++i];
    else if (arg === '--url') args.url = argv[++i];
    else if (arg === '--json') args.json = argv[++i];
    else if (arg === '--help') args.help = true;
  }
  return args;
}

/** Accepts a full Wikipedia URL or a ceremony year and returns the page title. */
export function pageTitleFromUrl(url) {
  const match = String(url).match(/\/wiki\/([^?#]+)/);
  if (!match) throw new Error(`Not a Wikipedia article URL: ${url}`);
  return decodeURIComponent(match[1]);
}

/** Derives the ceremony year from a page title like "98th_Academy_Awards". */
function yearFromPageTitle(title) {
  const match = title.match(/^(\d+)(?:st|nd|rd|th)_Academy_Awards$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const early = { 1: 1929, 2: 1930, 3: 1930, 4: 1931, 5: 1932 };
  return early[n] ?? n + 1928;
}

async function fetchWikitext(title) {
  const endpoint = new URL('https://en.wikipedia.org/w/api.php');
  endpoint.searchParams.set('action', 'parse');
  endpoint.searchParams.set('page', title);
  endpoint.searchParams.set('prop', 'wikitext');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('formatversion', '2');

  const response = await fetch(endpoint, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status} for ${title}`);

  const body = await response.json();
  if (body.error) throw new Error(`Wikipedia API error: ${body.error.info}`);
  return body.parse.wikitext;
}

// Archive records predating the current shape can omit secondary entirely, so
// never assume either side is present.
const names = (value) => (Array.isArray(value) ? value : value ? [String(value)] : []);

/**
 * Compared case- and punctuation-insensitively on purpose.
 *
 * Wikipedia writes "One Battle After Another" where the archive has "One Battle
 * after Another", and "Benicio del Toro" against "Benicio Del Toro". Treating
 * those as changes would rewrite a hundred records a year to no benefit and
 * bury the one line that genuinely moved. Cosmetic differences are left alone;
 * only real additions, removals and winner flips are reported.
 */
const fold = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const key = (nomination) =>
  `${names(nomination.primary).map(fold).join('|')}::${names(nomination.secondary).map(fold).join('|')}`;

/** Compares scraped categories against what the archive currently holds. */
function diff(existing, scraped) {
  const byName = new Map((existing ?? []).map((c) => [c.category, c]));
  const changes = [];

  for (const category of scraped) {
    const before = byName.get(category.category);
    if (!before) {
      changes.push({ kind: 'category-added', category: category.category, count: category.nominations.length });
      continue;
    }
    byName.delete(category.category);

    const beforeKeys = new Map(before.nominations.map((n) => [key(n), n]));
    const afterKeys = new Map(category.nominations.map((n) => [key(n), n]));

    for (const [k, nomination] of afterKeys) {
      const previous = beforeKeys.get(k);
      if (!previous) {
        changes.push({ kind: 'nomination-added', category: category.category, nomination });
      } else if (Boolean(previous.won) !== Boolean(nomination.won)) {
        changes.push({
          kind: 'winner-changed',
          category: category.category,
          nomination,
          from: Boolean(previous.won),
          to: Boolean(nomination.won),
        });
      }
    }
    for (const [k, nomination] of beforeKeys) {
      if (!afterKeys.has(k)) {
        changes.push({ kind: 'nomination-removed', category: category.category, nomination });
      }
    }
  }

  for (const [name, category] of byName) {
    changes.push({ kind: 'category-removed', category: name, count: category.nominations.length });
  }

  return changes;
}

const label = (n) => {
  const primary = names(n.primary).join(', ');
  const secondary = names(n.secondary).join(', ');
  return secondary ? `${primary} \u2014 ${secondary}` : primary;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.year && !args.url)) {
    console.log('usage: scrape-oscars.mjs (--year YYYY | --url WIKIPEDIA_URL) [--apply] [--json FILE]');
    process.exit(args.help ? 0 : 1);
  }

  const title = args.url ? pageTitleFromUrl(args.url) : pageTitleForYear(args.year);
  const year = args.year ?? yearFromPageTitle(title);
  if (!year) throw new Error(`Could not determine the ceremony year from "${title}". Pass --year.`);

  console.log(`source   https://en.wikipedia.org/wiki/${title}`);
  console.log(`ceremony ${year}`);
  console.log(`mode     ${args.apply ? 'APPLY (will write)' : 'DRY RUN (writes nothing)'}\n`);

  const wikitext = await fetchWikitext(title);
  const { categories, unmapped } = parseCeremony(wikitext);

  const nominationCount = categories.reduce((sum, c) => sum + c.nominations.length, 0);
  const winnerCount = categories.reduce(
    (sum, c) => sum + c.nominations.filter((n) => n.won).length,
    0,
  );
  console.log(`parsed   ${categories.length} categories, ${nominationCount} nominations, ${winnerCount} winners`);

  // Refuse to touch the archive if the page clearly did not parse.
  const problems = [];
  if (categories.length < 20) problems.push(`only ${categories.length} categories parsed, expected at least 20`);
  if (nominationCount < 80) problems.push(`only ${nominationCount} nominations parsed, expected at least 80`);
  if (winnerCount === 0) problems.push('no winners found; the page may list nominations only');
  const empty = categories.filter((c) => c.nominations.length === 0).map((c) => c.category);
  if (empty.length) problems.push(`categories with no nominations: ${empty.join(', ')}`);
  if (unmapped.length) {
    console.log(`\nunmapped categories (new or renamed on Wikipedia):`);
    for (const name of unmapped) console.log(`  - ${name}`);
    console.log('  Add these to CATEGORY_ALIASES if the archive spells them differently.');
  }

  if (problems.length) {
    console.log('\nsanity checks failed:');
    for (const p of problems) console.log(`  - ${p}`);
    console.log('\nRefusing to continue. Wikipedia markup has probably changed.');
    process.exit(2);
  }
  console.log('sanity   all checks passed');

  if (args.json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.json, JSON.stringify(categories, null, 2));
    console.log(`wrote    ${args.json}`);
  }

  // firebase-admin lives in functions/, which CI installs anyway; resolving it
  // from there avoids a second dependency tree just for this script.
  let admin;
  try {
    const { createRequire } = await import('node:module');
    const requireFromFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
    admin = requireFromFunctions('firebase-admin');
  } catch {
    console.log('\nfirebase-admin not installed in functions/; skipping the comparison.');
    console.log('Run `npm --prefix functions install` to enable it.');
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: 'https://uractordeveloper-default-rtdb.firebaseio.com/',
    });
  }

  const ref = admin.database().ref(`/oscars/${year}`);
  const existing = (await ref.once('value')).val();

  console.log(
    `archive  ${existing ? `${existing.length} categories already stored for ${year}` : `nothing stored for ${year} yet`}\n`,
  );

  const changes = diff(existing, categories);

  if (!changes.length) {
    console.log('No changes. The archive already matches Wikipedia.');
    return;
  }

  console.log(`${changes.length} change(s):\n`);
  for (const change of changes) {
    if (change.kind === 'category-added') console.log(`  + category  ${change.category} (${change.count} nominations)`);
    else if (change.kind === 'category-removed') console.log(`  - category  ${change.category} (${change.count} nominations)`);
    else if (change.kind === 'nomination-added') console.log(`  + ${change.category}: ${label(change.nomination)}${change.nomination.won ? '  [WINNER]' : ''}`);
    else if (change.kind === 'nomination-removed') console.log(`  - ${change.category}: ${label(change.nomination)}`);
    else if (change.kind === 'winner-changed') console.log(`  ~ ${change.category}: ${label(change.nomination)}  won ${change.from} -> ${change.to}`);
  }

  if (!args.apply) {
    console.log('\nDry run: nothing was written. Re-run with --apply to write these changes.');
    return;
  }

  await ref.set(categories);
  console.log(`\nWrote ${categories.length} categories to /oscars/${year}.`);
}

main()
  .then(() => {
    // The realtime database keeps an open socket, so the process would never
    // exit on its own and a CI job would hang until it timed out.
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\nerror: ${error.message}`);
    process.exit(1);
  });
