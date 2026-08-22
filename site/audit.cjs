/**
 * Structural accessibility + SEO audit of the built site.
 * Deliberately mechanical: checks things that can be verified from the markup.
 */
const fs = require('fs');
const path = require('path');

const DIST = process.argv[2] || 'dist';
const problems = [];
const files = [];

(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.html')) files.push(p);
  }
})(DIST);

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const name = file.replace(DIST + '/', '');
  const fail = (msg) => problems.push(`${name}: ${msg}`);

  if (!/<html lang="[a-z-]+"/.test(html)) fail('missing lang on <html>');
  if (!/<title>[^<]{5,}<\/title>/.test(html)) fail('missing or too-short <title>');
  if (!/<meta name="description" content="[^"]{30,}"/.test(html)) fail('missing/short meta description');
  if (!/<link rel="canonical"/.test(html)) fail('missing canonical');
  if (!/<meta name="viewport"/.test(html)) fail('missing viewport');

  const h1s = html.match(/<h1[^>]*>/g) || [];
  if (h1s.length !== 1) fail(`expected exactly one <h1>, found ${h1s.length}`);

  if (!/<main[\s>]/.test(html)) fail('no <main> landmark');
  if (!/id="main"/.test(html)) fail('no #main target for the skip link');
  if (!/class="skip-link"/.test(html)) fail('no skip link');
  if (!/<header[\s>]/.test(html)) fail('no <header> landmark');
  if (!/<footer[\s>]/.test(html)) fail('no <footer> landmark');

  // Every <nav> needs a distinguishing accessible name once there are several.
  const navs = html.match(/<nav[^>]*>/g) || [];
  const unnamed = navs.filter((n) => !/aria-label=|aria-labelledby=/.test(n));
  if (navs.length > 1 && unnamed.length) fail(`${unnamed.length} of ${navs.length} <nav> elements unnamed`);

  for (const img of html.match(/<img[^>]*>/g) || []) {
    if (!/alt=/.test(img)) fail('an <img> is missing alt');
  }

  // Inputs must be programmatically labelled.
  for (const input of html.match(/<input[^>]*>/g) || []) {
    const id = (input.match(/id="([^"]+)"/) || [])[1];
    const labelled = id && new RegExp(`<label[^>]*for="${id}"`).test(html);
    if (!labelled && !/aria-label=/.test(input)) fail(`input ${id || '(no id)'} has no label`);
  }

  // Buttons need a discernible name.
  for (const m of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) {
    const hasText = text(m[1]).length > 0;
    if (!hasText && !/aria-label=/.test(m[0])) fail('a <button> has no accessible name');
  }

  // Heading order must not skip levels.
  const levels = [...html.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) fail(`heading jumps h${levels[i - 1]} → h${levels[i]}`);
  }

  // Astro drops the newline when a line of prose is followed by a line starting
  // with an inline element, producing "seelimits and fair use". The words are
  // right and the markup is valid, so only the rendered text reveals it.
  // <span> is excluded: the route component joins a base URL and path on
  // purpose, and that is the only place it is used adjacent to text.
  for (const m of html.matchAll(/(.{0,30}[a-z,;:])<(a|code|strong|em)\b[^>]*>([^<]{0,20})/gi)) {
    const before = text(m[1]).slice(-30);
    fail(`missing space before <${m[2]}>: "${before}${m[3].trim()}"`);
  }

  if (/<a[^>]*>\s*(click here|here|read more)\s*<\/a>/i.test(html)) fail('non-descriptive link text');

  // A double-escaped entity renders literally on the page. That is what happens
  // when "&#8212;" is passed through a component attribute: the & is escaped
  // again, so the reader sees the markup instead of an em dash. Single entities
  // in the source are fine — the browser decodes those.
  const doubleEscaped = html.match(/&amp;(#\d+|[a-z]{2,10});/i);
  if (doubleEscaped) fail(`double-escaped entity renders as text: "${doubleEscaped[0]}"`);
}

console.log(`audited ${files.length} pages`);

// ---------------------------------------------------------------- contrast --
// Text that matches its background is invisible but perfectly valid markup, so
// markup checks cannot catch it. Compute the real WCAG ratio for each
// foreground/background pair the design actually uses.
const tokens = fs.readFileSync(path.join(__dirname, 'src/styles/tokens.css'), 'utf8');
const token = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  return m ? m[1] : null;
};

function luminance(hex) {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, what it is used for]
const PAIRS = [
  ['paper', 'ground', 4.5, 'body text'],
  ['paper-dim', 'ground', 4.5, 'secondary text'],
  ['paper-faint', 'ground', 3, 'labels and captions'],
  ['spot', 'ground', 4.5, 'links'],
  ['ok', 'ground', 4.5, '2xx status'],
  ['warn', 'ground', 4.5, '4xx status'],
  ['bad', 'ground', 4.5, '5xx status'],
  ['paper', 'ground-sunken', 4.5, 'text on input fields'],
  ['paper', 'ground-raised', 4.5, 'text on raised surfaces'],
];

console.log('\ncontrast:');
for (const [fg, bg, min, use] of PAIRS) {
  const a = token(fg);
  const b = token(bg);
  if (!a || !b) {
    problems.push(`token missing for contrast check: --${fg} / --${bg}`);
    continue;
  }
  const r = ratio(a, b);
  const pass = r >= min;
  console.log(
    `  ${pass ? 'ok  ' : 'FAIL'} --${fg} on --${bg}  ${r.toFixed(2)}:1 (min ${min})  ${use}`,
  );
  if (!pass) problems.push(`--${fg} on --${bg} is ${r.toFixed(2)}:1, below ${min} (${use})`);
}

if (problems.length) {
  console.log('\nissues:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nno structural accessibility, SEO or contrast issues found');
