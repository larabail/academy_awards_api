# Security

## Reporting a vulnerability

Please open a [security advisory](https://github.com/larabail/academy_awards_api/security/advisories/new)
rather than a public issue. I will acknowledge it as soon as I can.

This is a free side project, not a funded service, so please set expectations
accordingly — but anything that exposes another user's API key, allows writing
to the archive, or lets someone run up the project's bill is taken seriously.

## What is and is not a vulnerability here

**In scope**

- Reading or modifying another user's API key
- Writing to the awards archive through the API
- Bypassing the rate limit or the authentication on `/v1/account/*`
- Server-side request forgery, injection into the database path, or anything
  that reaches infrastructure

**Not in scope**

- **An API key being visible in browser traffic.** The key travels in the URL,
  so any key used from a browser is public by design. See
  [the authentication guide](https://developer.uractor.com/docs/authentication).
  A stolen key grants read access to public awards data and nothing else, and
  the per-key rate limit bounds what it can be used for.
- The Firebase web configuration in the developer portal. It is public by
  design and protected by security rules, not by secrecy.
- Missing security headers on the API host, which serves JSON only.
- Reports from automated scanners with no demonstrated impact.

## Credentials

No credentials belong in this repository. `functions/serviceAccountKey.json` is
git-ignored; deployed functions authenticate through application default
credentials, and CI uses the `FIREBASE_SERVICE_ACCOUNT` secret.

A service account key was committed in early history and has since been purged
and rotated. If you find any credential in this repository or its history,
please report it through the advisory link above.
