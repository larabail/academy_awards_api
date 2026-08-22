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

  if (/<a[^>]*>\s*(click here|here|read more)\s*<\/a>/i.test(html)) fail('non-descriptive link text');
}

console.log(`audited ${files.length} pages`);
if (problems.length) {
  console.log('\nissues:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('no structural accessibility or SEO issues found');
