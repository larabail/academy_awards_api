<!--
Title this pull request like a commit: kind(scope): imperative summary
e.g. feat(api): return matches case-insensitively
-->

## What this changes

<!-- What was wrong or missing before, and what this does about it. -->

## Why this way

<!--
The reasoning, and what you rejected. If you weighed two approaches, say which
and why the other lost. If you deliberately left something undone, say so here
rather than leaving it to be discovered.
-->

## How it was tested

<!--
The tests you added, and anything you checked by hand that a test cannot cover
— against the live API, on a preview channel, with a throwaway key.
-->

## Checklist

- [ ] Branched off `master`; no commits made directly on `master`
- [ ] No commit carries a `Co-authored-by` trailer
- [ ] Commit messages follow the convention in [AGENTS.md](../AGENTS.md)
- [ ] No credential is committed, and nothing new is written to
      `functions/serviceAccountKey.json`
- [ ] New behaviour has a test; a bug fix has a test that failed before it
- [ ] `npm --prefix site run verify` is clean, if the portal changed
- [ ] `node --test scripts/lib/parse-ceremony.test.mjs` passes, if the scraper
      changed
- [ ] `node scripts/check-config.mjs` is clean, if `firebase.json` or
      `.firebaserc` changed
- [ ] Scraper sanity checks were not relaxed to make a run pass
- [ ] `README.md` was updated for any setup, command, endpoint, CI or
      architecture change
