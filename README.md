# UrActor Academy Awards API

Firebase project powering the UrActor Oscars data API and its developer portal.

| Host | Firebase Hosting site | Served from | Purpose |
| --- | --- | --- | --- |
| `https://api.uractor.com/` | `uractordeveloper` | `api-public/` + `functions/` | JSON API endpoints |
| `https://developer.uractor.com/` | `uractor-developer` | `public/` | Docs, sign-up, API key management |

Firebase project ID: `uractordeveloper`. Data lives in Realtime Database
(`/oscars`); API keys live in Firestore (`apiKeys`, `users`).

## Layout

```
api-public/       Static root for the API host (no index.html, so every path hits the function)
public/           Developer portal: API guide, sign-up/login, API key display
functions/        Express app deployed as the `app` HTTPS function
firebase.json     Two hosting targets: `api` and `developer`
.firebaserc       Maps those targets to Hosting sites
```

## Endpoints

All endpoints require a key: append `/apikey=YOUR_API_KEY`.

| Endpoint | Description |
| --- | --- |
| `GET /` | Service metadata and a link to the developer portal (no key needed) |
| `GET /oscars/apikey=KEY` | All Oscars data |
| `GET /oscars/year={year}/apikey=KEY` | Oscars data for one year |
| `GET /person/name={name}/apikey=KEY` | Nominations matching a person |
| `GET /movie/name={name}/year={year}/apikey=KEY` | Nominations matching a film in a year |
| `GET /award/name={name}/apikey=KEY` | An award category across all years |
| `GET /award/name={name}/year={year}/apikey=KEY` | An award category in one year |

```bash
curl https://api.uractor.com/oscars/year=2024/apikey=YOUR_API_KEY
curl https://api.uractor.com/award/name=Best%20Picture/apikey=YOUR_API_KEY
```

Invalid or missing keys return `403 {"error": "Forbidden - Invalid API Key"}`.

## Deploying

```bash
npm --prefix functions install

firebase deploy --only hosting:developer   # portal  -> developer.uractor.com
firebase deploy --only hosting:api         # API host -> api.uractor.com
firebase deploy --only functions           # Express app
firebase deploy                            # everything
```

## One-time setup: pointing developer.uractor.com at the portal

`developer.uractor.com` currently resolves to the main marketing site, so it
serves the same page as `uractor.com`. Hosting sites and custom domains are not
configurable from this repo — do this once in the Firebase Console:

1. **Firebase Console → Hosting → Add another site**, site ID `uractor-developer`.
   This must match the `developer` target in `.firebaserc`.
2. Link the target locally (already committed in `.firebaserc`, so only needed on
   a fresh clone that lacks it):
   ```bash
   firebase target:apply hosting developer uractor-developer
   firebase target:apply hosting api uractordeveloper
   ```
3. Deploy the portal so the site is not empty:
   ```bash
   firebase deploy --only hosting:developer
   ```
4. On the `uractor-developer` site, **Add custom domain** → `developer.uractor.com`.
5. Remove the existing `developer.uractor.com` mapping from the marketing site
   first, otherwise the domain cannot be claimed.
6. Update DNS at the registrar with the records Firebase shows, then wait for
   certificate provisioning.

`api.uractor.com` stays attached to the existing `uractordeveloper` site, so the
live API keeps working throughout — no DNS change is required for it.

> Because `api-public/` has no `index.html`, `https://api.uractor.com/` is handled
> by the function and returns JSON pointing at the portal, rather than rendering
> the docs page as it did before the split.

## Credentials

`functions/serviceAccountKey.json` is **git-ignored**. Deployed Cloud Functions
authenticate through application default credentials automatically, so the file
is only needed to run the emulator locally.

> This key was committed in earlier history. Rotate it in
> **Google Cloud Console → IAM & Admin → Service Accounts**, and purge it from git
> history if this repository is ever made public.

## Local development

```bash
npm --prefix functions install
firebase emulators:start --only functions,hosting
```
