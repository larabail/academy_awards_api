The working agreement for this repository lives in [AGENTS.md](../AGENTS.md).
Read it before making any change.

The parts that get changes rejected most often:

- Never commit to `master`; branch and open a pull request.
- Never add a `Co-authored-by` trailer to a commit.
- Never commit a credential. `functions/serviceAccountKey.json` stays
  git-ignored; CI uses the `FIREBASE_SERVICE_ACCOUNT` secret.
- New behaviour needs a test; a bug fix needs a test that failed before it. Pure
  logic goes in its own file so it can be tested without credentials.
- `npm --prefix site run verify` must be clean. The audit fails on things a type
  checker cannot see — heading order, colour contrast, missing landmarks, text
  run together with a link.
- The scraper never writes unattended, and its sanity checks do not get relaxed
  to make a run pass.
- Commits and pull request titles are `kind(scope): imperative summary`, and the
  body explains why, not what.
