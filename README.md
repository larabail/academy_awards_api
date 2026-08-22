# UrActor Academy Awards API

Firebase project powering the UrActor Oscars API and its developer portal.

| Host | Hosting site | Served from | Purpose |
| --- | --- | --- | --- |
| `https://api.uractor.com/` | `uractordeveloper` | `api-public/` + `functions/` | JSON API |
| `https://developer.uractor.com/` | `uractor-developer` | `site/dist/` | Docs, sign-in, key management |

Firebase project: `uractordeveloper`. Awards data lives in Realtime Database
under `/oscars`; API keys live in Firestore (`apiKeys`, `users`).

## Layout

```
site/           Astro static site — the developer portal
  src/data/api.ts   every endpoint defined once; drives docs, nav and OpenAPI
  src/pages/        guides, generated reference pages, the account page
  audit.cjs         structural a11y/SEO gate over the built HTML
functions/      Express app deployed as the `app` HTTPS function
api-public/     Static root for the API host — deliberately has no index.html
```

## The portal

Built on the same ordering as [laraos](https://github.com/larabail/laraos): the
readable, indexable document is what gets built, and the theme is painted on top
of it. Every documentation page is server-rendered at build time and ships **no
JavaScript** beyond ~0.3 KB inline that reveals the copy buttons — remove that
and the pages still read correctly. Only `/account` loads Firebase, and it is
`noindex` and excluded from the sitemap.

The design is an Academy ceremony programme: navy cover stock, gold foil rules,
cream insert pages, and a wax-sealed envelope that opens to present your key.
Gold gradients are confined to decorative surfaces; every colour carrying text
clears WCAG AA (foil on navy is 10.7:1).

```bash
cd site
npm install
npm run dev        # local dev server
npm run verify     # type check + build + accessibility/SEO audit
```

`npm run audit` fails on a missing `<h1>`, a skipped heading level, an
unlabelled input, a missing landmark, a missing canonical, and similar.

## Endpoints

All data endpoints take the key as the **final path segment**, not a header or
query parameter.

| Endpoint | Description |
| --- | --- |
| `GET /` | Service metadata (no key needed) |
| `GET /oscars/apikey=KEY` | The whole archive, 1929&ndash;2026 |
| `GET /oscars/year={year}/apikey=KEY` | One ceremony |
| `GET /person/name={name}/apikey=KEY` | Nominations naming a person (exact match) |
| `GET /movie/name={name}/year={year}/apikey=KEY` | A film at one ceremony (exact match) |
| `GET /award/name={name}/apikey=KEY` | A category across all years (substring match) |
| `GET /award/name={name}/year={year}/apikey=KEY` | A category at one ceremony |

Account endpoints are versioned and take a Firebase ID token as
`Authorization: Bearer <token>`:

| Endpoint | Description |
| --- | --- |
| `GET /v1/account/key` | Read the caller's key, 404 if none |
| `POST /v1/account/key` | Issue a first key; returns the existing one if there is one |
| `POST /v1/account/key/rotate` | Issue a new key and revoke the old one atomically |
| `DELETE /v1/account/key` | Revoke without replacing |

Machine-readable description: <https://developer.uractor.com/openapi.json>,
generated at build time from `site/src/data/api.ts`.

### Performance

The archive is about a megabyte and changes twice a year, so each function
instance keeps one copy in memory for 30 minutes.

This matters because the searches that span all ceremonies previously read the
whole archive from the database on every request — roughly 2.2 seconds and a
megabyte of egress to return a fraction of a kilobyte. Measured against the live
API before and after:

| Endpoint | Before | After |
| --- | --- | --- |
| `/person/name=` | 2190 ms | 207 ms |
| `/award/name=` | 2675 ms | 182 ms |

A write made by the updater is picked up within the cache window.

Path parameters are validated before they reach a database reference. `1929.5`
used to return `500`, because a dot is not a legal key in the realtime database;
it now returns `400`. A year outside 1929 to next year is rejected the same way,
while 1933 — a real year with no ceremony — still returns `404`.

### Rate limiting and CORS

Every key is capped at **60 requests per minute**, returning `429` with `Retry-After`.
The counter is held in memory per function instance rather than in Firestore, so
it costs nothing per request — a limiter that billed you on every call to
protect you from bills would defeat itself. The trade-off is that it is
approximate: the ceiling is 60 x live instances. `maxInstances: 10` on the
export is what makes the worst case bounded, and it is the single most effective
cost control here.

CORS is decided per path. Data routes stay open to any origin, which is what a
read-only API for public data should do and what comparable APIs (TMDB) do — a
key used from a browser is unavoidably visible, and the rate limit is what bounds
the consequences. Account routes are restricted to the portal's own origins,
since nothing else should ever call them.

### The API host serves no UI

`api.uractor.com` has no site on it — `api-public/` deliberately contains no
`index.html`, so every path falls through to the function. The two non-data
routes (`/` and the catch-all 404) negotiate on `Accept`:

- **API clients** (a wildcard or JSON `Accept`) get JSON, as before.
- **Browsers** get roughly 1.2 KB of HTML: one sentence saying this is an API
  endpoint, and a link to the portal. It is `noindex`, and carries an inline SVG
  icon so the browser never requests `/favicon.ico` — Firebase Hosting answers
  that itself with an empty page instead of passing it to the function.

Data and account routes always return JSON regardless of `Accept`. Both
negotiated routes send `Vary: Accept` and `no-store` so the CDN can never serve
one representation in place of the other. The requested path is reflected into
the 404 page and is HTML-escaped.

### Why key management is server-side

The browser never touches Firestore. `firestore.rules` denies all client access,
and the only route to the key store is through these endpoints, which verify a
Firebase ID token first. That means a compromised browser session cannot
enumerate anyone else's key. Keys are generated with `crypto.randomUUID()`.

> Account responses set `Cache-Control: no-store, private` and `Vary: Authorization`.
> This is load-bearing: Firebase Hosting otherwise applies a default
> `max-age=600` to function GET responses, which would let the CDN serve one
> user's key to another.

## Continuous integration

Two workflows, both of which only touch the parts of the repo that actually
changed.

### `PR` — `.github/workflows/pr.yml`

Runs on every pull request into `master`.

| Job | Runs when | What it does |
| --- | --- | --- |
| `config` | firebase config or scripts change | Checks every hosting target is mapped to a site, public dirs exist, and the API host has no `index.html` |
| `site` | `site/**`, `firebase.json`, `.firebaserc` | `npm ci`, type check, build, then the accessibility/SEO/contrast audit |
| `preview` | site built successfully | Deploys to a per-PR Firebase preview channel and **comments the URL on the PR**, updating the same comment on later pushes |
| `functions` | `functions/**`, `firebase.json`, `.firebaserc` | `npm ci` (which fails if the lockfile drifted), syntax check, and a guard that the declared Node runtime is still supported |
| `pr` | always | Aggregates the above into one check suitable for branch protection |

Touch only `functions/` and the site is never built; touch only `site/` and the
functions job is skipped.

The `preview` job is skipped for pull requests from forks, because secrets are
not available there — skipped rather than failed, so the run stays green.

### `Release` — `.github/workflows/release.yml`

Runs on push to `master`, and can be run manually with tick boxes to force a
specific deploy.

| Job | Deploys when | Target |
| --- | --- | --- |
| `site` | `site/**` changed | `hosting:developer`, after re-running the full verify |
| `api-host` | `api-public/**` changed | `hosting:api` |
| `functions` | `functions/**` changed | `functions` |

**If nothing in `functions/` changed, functions are not deployed** — and the same
for each of the others. A change to `firebase.json` or `.firebaserc` counts as a
change to everything, because it is.

Both deploy jobs verify their work afterwards rather than trusting the exit
code: the portal deploy re-requests four pages, and the functions deploy checks
that the root responds, that an invalid key is still rejected, and that an
unauthenticated account read still returns `401`.

### `Update Oscars` — `.github/workflows/update-oscars.yml`

Keeps the archive current from Wikipedia. Runs daily across 20–27 January
(nominations) and 12–20 March (the ceremony), which is the only time the data
changes, plus on demand.

```bash
node scripts/scrape-oscars.mjs --year 2026            # dry run, writes nothing
node scripts/scrape-oscars.mjs --url https://en.wikipedia.org/wiki/98th_Academy_Awards
node scripts/scrape-oscars.mjs --year 2026 --apply    # writes
```

**A scheduled run can never write.** It performs a dry run, and if it finds
changes it opens an issue containing the diff. Applying is a manual run with the
box ticked. One ceremony a year is not worth automating a write to production
data for.

Wikipedia is the source rather than `awardsdatabase.oscars.org`, which returns
`403` to every non-browser client and renders through JavaScript. The Wikipedia
Action API returns raw wikitext over a plain `GET` with no auth, and is updated
within minutes of both announcements.

Two things protect the archive:

- **Sanity checks.** Fewer than 20 categories, fewer than 80 nominations, no
  winners, or any empty category, and the scraper exits `2` without writing.
  Verified: the 2015 page uses older markup with no winner markers, and the
  scraper correctly refuses it.
- **Cosmetic differences are ignored.** Wikipedia writes "One Battle After
  Another" where the archive has "One Battle after Another". Comparing
  case-insensitively stops a hundred records a year being rewritten for nothing,
  which would bury the one line that genuinely moved.

Category names are translated on the way in — Wikipedia's "Best Directing" is
the archive's "Best Achievement in Directing". A category with no mapping is
reported rather than silently accepted, so a new award (Best Casting arrived in
2026) surfaces instead of appearing under Wikipedia's spelling.

`scripts/lib/parse-ceremony.mjs` has no I/O and is covered by
`node --test scripts/lib/parse-ceremony.test.mjs`. Every test corresponds to a
bug the dry run found against live data.

### Required setup

One secret, `FIREBASE_SERVICE_ACCOUNT`, containing the JSON key of a service
account with permission to deploy. Do **not** reuse
`functions/serviceAccountKey.json` — it was committed in earlier history.

```bash
PROJECT=uractordeveloper
SA=github-actions-deployer

gcloud iam service-accounts create "$SA" \
  --project "$PROJECT" --display-name "GitHub Actions deployer"

EMAIL="$SA@$PROJECT.iam.gserviceaccount.com"
for ROLE in \
  roles/firebase.admin \
  roles/cloudfunctions.admin \
  roles/iam.serviceAccountUser \
  roles/artifactregistry.admin \
  roles/cloudbuild.builds.editor \
  roles/serviceusage.serviceUsageConsumer
do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member "serviceAccount:$EMAIL" --role "$ROLE" --condition None
done

gcloud iam service-accounts keys create key.json --iam-account "$EMAIL"
gh secret set FIREBASE_SERVICE_ACCOUNT --repo larabail/academy_awards_api < key.json
rm key.json
```

Set the required status check for branch protection to **`PR / PR`**, which is
the aggregate job.

## Deploying

```bash
npm --prefix functions install
npm --prefix site install && npm --prefix site run build

firebase deploy --only hosting:developer   # portal
firebase deploy --only hosting:api         # API host
firebase deploy --only functions           # Express app
```

Day to day this happens through CI; the commands above are for a manual deploy.
`node scripts/check-config.mjs` runs the same configuration checks CI does.

The portal must be built before deploying it; `site/dist` is git-ignored.

## One-time setup: pointing developer.uractor.com at the portal

`developer.uractor.com` currently resolves to the marketing site. Custom domains
are not configurable from this repo — do this in the Firebase Console:

1. The `uractor-developer` Hosting site already exists and is mapped to the
   `developer` target in `.firebaserc`. On a fresh clone that lacks it:
   ```bash
   firebase target:apply hosting developer uractor-developer
   firebase target:apply hosting api uractordeveloper
   ```
2. Remove the `developer.uractor.com` mapping from the marketing site, otherwise
   the domain cannot be claimed.
3. **Hosting → `uractor-developer` → Add custom domain** → `developer.uractor.com`,
   then add the DNS records Firebase shows and wait for the certificate.
4. **Authentication → Settings → Authorized domains**: add `developer.uractor.com`,
   or sign-in will be refused on the new hostname.

`api.uractor.com` stays attached to `uractordeveloper` throughout, so the live
API is unaffected and needs no DNS change.

## Credentials

`functions/serviceAccountKey.json` is git-ignored. Deployed functions
authenticate through application default credentials; the file is only needed to
run the emulator locally.

> This key was committed in earlier history. Rotate it in
> **Google Cloud Console → IAM & Admin → Service Accounts**, and purge it from
> git history if this repository is ever made public.

## Local development

```bash
npm --prefix functions install
firebase emulators:start --only functions,hosting
```
