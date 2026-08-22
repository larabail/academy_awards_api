# Working in this repository

Instructions for agents and humans working on the Academy Awards API. Read this
before making any change.

This repository holds a free JSON API for Oscars data and the developer portal
that documents it. `README.md` covers what it is, how it is laid out and how to
run it; this file covers how work gets done.

## The rules

These are not style preferences. Breaking one of these means the change gets
sent back.

### Never commit to `master`

`master` is what deploys. A merge builds and ships whichever components changed.
All work happens on a branch and lands through a pull request.

Branch names are `kind/short-description`, using the same kinds as the commit
convention below — `feat/winner-filter`, `fix/year-validation`,
`ci/preview-channel`, `docs/rate-limits`.

### Never add a `Co-authored-by` trailer

Commits must not carry `Co-authored-by:` lines, and in particular must not
attribute anything to Copilot. If your tooling adds one by default, strip it
before committing. This applies to squash-merge commit bodies too.

### Never commit a credential

`functions/serviceAccountKey.json` is git-ignored and must stay that way.
Deployed functions authenticate through application default credentials; CI uses
the `FIREBASE_SERVICE_ACCOUNT` secret. A key was committed early in this
project's history and had to be purged and rotated — do not repeat it.

The Firebase web configuration served at `/__/firebase/init.js` is public by
design and is not a secret. Do not hardcode it either; the portal loads it from
that reserved URL so the values live in one place.

### The portal audit is a gate, not a suggestion

`site/audit.cjs` runs on every pull request and fails the build on things that
are valid HTML and therefore invisible to a type checker: a missing `<h1>`, a
skipped heading level, an unlabelled input, a missing landmark or canonical, a
double-escaped entity, a colour pair below WCAG AA, and text run together with
an inline element.

Every rule in it exists because that bug shipped. Do not weaken a rule to make a
build pass; fix the page, or make the case for the rule being wrong.

```bash
npm --prefix site run verify   # type check, build, audit
```

### New behaviour comes with a test

Pure logic goes in its own file so it can be tested without credentials or a
network call. `scripts/lib/parse-ceremony.mjs` is the model: it does no I/O, so
`node --test scripts/lib/parse-ceremony.test.mjs` covers it directly, while the
fetching and the database live in the script that calls it.

Every test in that file corresponds to a bug found against live data. A bug fix
gets a test that fails before the fix.

### The scraper must never write unattended

`scripts/scrape-oscars.mjs` is a dry run unless `--apply` is passed, and the
scheduled workflow can only dry run. It opens an issue with the diff and a human
applies it.

Keep the sanity checks strict. They refuse to continue on too few categories,
too few nominations, no winners, or an empty category, because the failure mode
is overwriting 97 years of data with a bad parse. If a check fires on a real
change, work out why before relaxing it.

### Keep `README.md` current

If a change alters setup, commands, endpoints, CI behaviour or architecture,
update the README in the same pull request. Do not leave the next person to
discover the new truth by reading the diff or a workflow log.

## Commit convention

Conventional Commits, with a body that explains the reasoning.

```
kind(scope): imperative summary in lower case

Why this change was needed, and what was wrong before.

What the change does about it, and any consequence a reader would not guess.
Note anything deliberately left undone.
```

Kinds in use: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `ci`, `build`,
`chore`. The scope is the area touched — `api`, `portal`, `hosting`, `data`,
`auth`. It is optional when a change is genuinely repo-wide.

The summary line stays under about 72 characters, is imperative ("add", not
"added" or "adds"), and has no trailing full stop.

The body is the part that matters. Explain the problem before the solution. A
diff shows what changed; only the message can say why, and why the alternatives
were worse. Record the tradeoffs and anything you chose not to do.

Do not describe the change as a list of edited files. Do not write "as
requested". Do not mention the agent, the model, or the conversation.

## Pull requests

The title has the same shape as a commit summary, because it becomes the
squash-merge subject and has to stand on its own in `git log`.

```
feat(api): return matches case-insensitively
fix(portal): stop the CDN caching authenticated responses
ci: deploy only the components whose sources changed
```

Never open a pull request titled `Update index.js`, `changes`, or `WIP`.

Fill in `.github/pull_request_template.md`. A red pull request does not get
merged; fix it rather than merging around it.

## What CI does

`pr.yml` builds only what changed. Touch `functions/` and the site is not built;
touch `site/` and the functions job is skipped. The site job runs the type
check, the build and the audit, then deploys a per-pull-request preview channel
and comments the URL.

`release.yml` deploys `hosting:developer`, `hosting:api` and `functions`
independently on merge, each only if its own sources moved, and verifies
afterwards rather than trusting the exit code.

`update-oscars.yml` runs the scraper across the two windows a year when the data
can change.

## Things that will waste your time

- **Firebase Hosting header rules match the request path, not the file.**
  `cleanUrls` serves `/reference` from `reference.html`, so a rule sourced at
  `**/*.html` matches nothing and every page silently falls back to
  `max-age=3600`. That made deploys appear to take an hour and made a fixed bug
  look unfixed. Match `**` and let hashed assets opt back into a long cache.
- **Firebase Hosting caches function `GET` responses by default.** An
  authenticated endpoint must send `Cache-Control: no-store` and
  `Vary: Authorization`, or the CDN will serve one user's response to another.
  This was observed happening on the account endpoints, not theorised.
- **A Cloud Functions runtime can be decommissioned out from under you.** Node
  18 was, and every deploy failed with an error that named the runtime and
  nothing else. `pr.yml` now fails loudly on an unsupported `engines.node`.
- **Astro escapes component attributes.** Passing `&#8212;` as a prop renders
  the entity literally on the page. Put the real character in the attribute.
- **Astro drops the newline between prose and a following inline element**, so
  a line ending in "See" followed by a line starting with `<a>` renders as
  "Seelimits". End the line with `{' '}`. The audit catches this now.
- **Realtime database keys cannot contain a dot.** Interpolating an unvalidated
  year into a path turned `1929.5` into a 500. Validate before the value reaches
  a reference.
- **The realtime database keeps a socket open**, so a script that reads it never
  exits on its own and a CI job hangs until it times out. Exit explicitly.
- **An API key in a URL is public.** Anything callable from a browser exposes
  its key; that is documented and accepted, and the per-key rate limit is what
  bounds it. Do not try to solve it with secrecy.
