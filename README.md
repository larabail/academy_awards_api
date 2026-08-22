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
| `GET /` | Service metadata and a link to the portal (no key needed) |
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

### Why key management is server-side

The browser never touches Firestore. `firestore.rules` denies all client access,
and the only route to the key store is through these endpoints, which verify a
Firebase ID token first. That means a compromised browser session cannot
enumerate anyone else's key. Keys are generated with `crypto.randomUUID()`.

> Account responses set `Cache-Control: no-store, private` and `Vary: Authorization`.
> This is load-bearing: Firebase Hosting otherwise applies a default
> `max-age=600` to function GET responses, which would let the CDN serve one
> user's key to another.

## Deploying

```bash
npm --prefix functions install
npm --prefix site install && npm --prefix site run build

firebase deploy --only hosting:developer   # portal
firebase deploy --only hosting:api         # API host
firebase deploy --only functions           # Express app
```

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
