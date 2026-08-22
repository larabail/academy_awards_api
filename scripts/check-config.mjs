#!/usr/bin/env node
/**
 * Config sanity checks that need no credentials, so CI can run them on a PR.
 *
 * These catch the class of mistake that only shows up at deploy time: a hosting
 * target that exists in firebase.json but is not mapped to a site, a public
 * directory that does not exist, or the API host accidentally gaining an
 * index.html, which would stop every path falling through to the function.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const ok = [];

const readJson = (name) => {
  try {
    return JSON.parse(readFileSync(join(root, name), 'utf8'));
  } catch (error) {
    problems.push(`${name} is not valid JSON: ${error.message}`);
    return null;
  }
};

const firebase = readJson('firebase.json');
const rc = readJson('.firebaserc');

if (firebase && rc) {
  const project = rc.projects?.default;
  if (!project) problems.push('.firebaserc has no default project');
  else ok.push(`default project: ${project}`);

  const targets = rc.targets?.[project]?.hosting ?? {};
  const mapped = Object.keys(targets);
  const hosting = Array.isArray(firebase.hosting) ? firebase.hosting : [firebase.hosting];

  for (const site of hosting.filter(Boolean)) {
    const { target, public: publicDir } = site;

    if (!target) {
      problems.push('a hosting entry has no target, so deploys cannot address it individually');
      continue;
    }
    if (!mapped.includes(target)) {
      problems.push(`hosting target "${target}" is not mapped to a site in .firebaserc`);
    } else {
      ok.push(`target "${target}" -> site "${targets[target].join(', ')}"`);
    }

    // site/dist only exists after a build, so only assert on checked-in dirs.
    if (!publicDir.includes('dist') && !existsSync(join(root, publicDir))) {
      problems.push(`hosting target "${target}" points at "${publicDir}", which does not exist`);
    }

    // The API host must have no index.html, or "/" would serve a page instead
    // of falling through to the function.
    if (target === 'api' && existsSync(join(root, publicDir, 'index.html'))) {
      problems.push(`${publicDir}/index.html exists; the API host must serve no UI`);
    }
  }

  const functionsEntry = Array.isArray(firebase.functions)
    ? firebase.functions[0]
    : firebase.functions;
  if (functionsEntry?.source) {
    const pkgPath = join(root, functionsEntry.source, 'package.json');
    if (!existsSync(pkgPath)) {
      problems.push(`functions source "${functionsEntry.source}" has no package.json`);
    } else {
      const runtime = JSON.parse(readFileSync(pkgPath, 'utf8')).engines?.node;
      if (!runtime) problems.push('functions/package.json declares no engines.node runtime');
      else ok.push(`functions runtime: node ${runtime}`);
    }
  }
}

for (const line of ok) console.log('  ok  ' + line);
if (problems.length) {
  console.log('\nissues:');
  for (const p of problems) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nfirebase configuration is consistent');
