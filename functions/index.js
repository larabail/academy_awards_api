// Pinned to the v1 API so the deployed function keeps its existing trigger
// shape and URL; firebase-functions v6 defaults its root export to v2.
const functions = require('firebase-functions/v1');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const serviceAccountPath = './serviceAccountKey.json';

// Cloud Functions injects credentials at runtime, so the service account key is
// only needed when running the emulator outside Google infrastructure.
function resolveCredential() {
  try {
    return admin.credential.cert(require(serviceAccountPath));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return admin.credential.applicationDefault();
  }
}

admin.initializeApp({
  credential: resolveCredential(),
  databaseURL: 'https://uractordeveloper-default-rtdb.firebaseio.com/',
});

const db = admin.database();
const firestore = admin.firestore();

const { randomUUID } = require('crypto');

/**
 * Account endpoints below let a signed-in user manage their own key. They exist
 * so the browser never touches Firestore directly: the security rules stay
 * closed, and the only way to reach the key store is through a request whose
 * Firebase ID token has been verified here.
 */
async function requireUser(req, res, next) {
  // Firebase Hosting puts a default max-age on function responses, which for an
  // authenticated endpoint would let the CDN serve one user's key to another.
  // Every account response must be uncacheable, including the failures.
  res.set('Cache-Control', 'no-store, private');
  res.set('Vary', 'Authorization');

  const header = req.get('Authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Unauthorized - sign in first' });
  }
  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    return next();
  } catch (error) {
    console.error('Error verifying ID token:', error.message);
    return res.status(401).json({ error: 'Unauthorized - invalid session' });
  }
}

/** Issues a key and points it back at the owner, replacing any previous key. */
async function issueKey(uid, email) {
  const userRef = firestore.collection('users').doc(uid);
  const snapshot = await userRef.get();
  const previousKey = snapshot.exists ? snapshot.data().apiKey : undefined;

  const apiKey = randomUUID();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = firestore.batch();
  batch.set(firestore.collection('apiKeys').doc(apiKey), { user: uid, createdAt: now });
  if (previousKey && previousKey !== apiKey) {
    batch.delete(firestore.collection('apiKeys').doc(previousKey));
  }
  batch.set(userRef, { apiKey, email: email || null, updatedAt: now }, { merge: true });
  await batch.commit();

  return apiKey;
}

app.get('/v1/account/key', requireUser, async (req, res) => {
  try {
    const snapshot = await firestore.collection('users').doc(req.user.uid).get();
    const apiKey = snapshot.exists ? snapshot.data().apiKey : undefined;
    if (!apiKey) {
      return res.status(404).json({ error: 'No key issued yet' });
    }
    return res.status(200).json({ apiKey });
  } catch (error) {
    console.error('Error reading key:', error);
    return res.status(500).json({ error: 'Error reading key' });
  }
});

// Issues a first key, or returns the existing one so the call is safe to repeat.
app.post('/v1/account/key', requireUser, async (req, res) => {
  try {
    const snapshot = await firestore.collection('users').doc(req.user.uid).get();
    const existing = snapshot.exists ? snapshot.data().apiKey : undefined;
    if (existing) {
      return res.status(200).json({ apiKey: existing, created: false });
    }
    const apiKey = await issueKey(req.user.uid, req.user.email);
    return res.status(201).json({ apiKey, created: true });
  } catch (error) {
    console.error('Error issuing key:', error);
    return res.status(500).json({ error: 'Error issuing key' });
  }
});

app.post('/v1/account/key/rotate', requireUser, async (req, res) => {
  try {
    const apiKey = await issueKey(req.user.uid, req.user.email);
    return res.status(200).json({ apiKey, rotated: true });
  } catch (error) {
    console.error('Error rotating key:', error);
    return res.status(500).json({ error: 'Error rotating key' });
  }
});

app.delete('/v1/account/key', requireUser, async (req, res) => {
  try {
    const userRef = firestore.collection('users').doc(req.user.uid);
    const snapshot = await userRef.get();
    const apiKey = snapshot.exists ? snapshot.data().apiKey : undefined;
    if (!apiKey) {
      return res.status(404).json({ error: 'No key issued yet' });
    }
    const batch = firestore.batch();
    batch.delete(firestore.collection('apiKeys').doc(apiKey));
    batch.set(
      userRef,
      { apiKey: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
    await batch.commit();
    return res.status(200).json({ revoked: true });
  } catch (error) {
    console.error('Error revoking key:', error);
    return res.status(500).json({ error: 'Error revoking key' });
  }
});

async function checkApiKey(req, res, next) {
  const apiKey = req.params.apikey;
  if (!apiKey) {
    return res.status(403).json({ error: 'Forbidden - API Key is required' });
  }
  try {
    const doc = await firestore.collection('apiKeys').doc(apiKey).get();
    if (!doc.exists) {
      return res.status(403).json({ error: 'Forbidden - Invalid API Key' });
    }
    next();
  } catch (error) {
    console.error('Error validating API key:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}


async function getPersonByName(name) {
  const ref = db.ref('/oscars');
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  const result = [];
  for (const year in data) {
    for (const categoryData of data[year] || []) {
      for (const nomination of categoryData.nominations || []) {
        if ((nomination.primary && nomination.primary.includes(name)) ||
          (nomination.secondary && nomination.secondary.includes(name))) {
          result.push({ year, category: categoryData.category, nomination });
        }
      }
    }
  }
  return result;
}

async function getMovieByNameAndYear(name, year) {
  const ref = db.ref(`/oscars/${year}`);
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  const result = [];
  for (const categoryData of data || []) {
    for (const nomination of categoryData.nominations || []) {
      if ((nomination.primary && nomination.primary.includes(name)) ||
        (nomination.secondary && nomination.secondary.includes(name))) {
        result.push({ category: categoryData.category, nomination });
      }
    }
  }
  return result;
}

async function getAwardByName(name) {
  const ref = db.ref('/oscars');
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  const result = [];
  for (const year in data) {
    for (const categoryData of data[year] || []) {
      if (categoryData.category && categoryData.category.includes(name)) {
        result.push({ year, category: categoryData.category, nominations: categoryData.nominations });
      }
    }
  }
  return result;
}

async function getAwardByNameAndYear(name, year) {
  const ref = db.ref(`/oscars/${year}`);
  const snapshot = await ref.once('value');
  const data = snapshot.val();

  const result = [];
  for (const categoryData of data || []) {
    if (categoryData.category && categoryData.category.includes(name)) {
      result.push({ category: categoryData.category, nominations: categoryData.nominations });
    }
  }
  return result;
}

const DEVELOPER_PORTAL_URL = 'https://developer.uractor.com/';

const ENDPOINT_LIST = [
  '/oscars/apikey=YOUR_API_KEY',
  '/oscars/year={year}/apikey=YOUR_API_KEY',
  '/person/name={name}/apikey=YOUR_API_KEY',
  '/movie/name={name}/year={year}/apikey=YOUR_API_KEY',
  '/award/name={name}/apikey=YOUR_API_KEY',
  '/award/name={name}/year={year}/apikey=YOUR_API_KEY',
];

/**
 * This host serves the API and nothing else. A person who lands here in a
 * browser still deserves a sentence telling them where to go, so the two
 * non-data routes below negotiate: JSON for clients, one line of HTML for
 * browsers. The inline SVG icon stops the browser requesting /favicon.ico,
 * which Firebase Hosting answers itself with an empty page.
 */
function landingPage(heading, note) {
  // `note` can contain the requested path, so it must never be trusted.
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UrActor Academy Awards API</title>
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230e1626'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='%23e3c567'%3E%E2%98%85%3C/text%3E%3C/svg%3E">
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:2rem;
background:#0e1626;color:#f2ece0;
font-family:ui-serif,Georgia,'Times New Roman',serif;line-height:1.6;text-align:center}
main{max-width:34rem}
p{margin:0 0 .75rem}
.star{color:#e3c567}
a{color:#e3c567;text-underline-offset:.18em}
a:focus-visible{outline:2px solid #e3c567;outline-offset:3px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em;color:#a9b4c8}
</style>
</head>
<body>
<main>
<p><span class="star" aria-hidden="true">&#9733;</span> ${escape(heading)}</p>
<p>Documentation and API keys: <a href="${DEVELOPER_PORTAL_URL}">developer.uractor.com</a></p>
${note ? `<p><code>${escape(note)}</code></p>` : ''}
</main>
</body>
</html>`;
}

/**
 * Order matters: a wildcard Accept header (curl, fetch, most clients) resolves
 * to the first entry, so JSON stays the default and only an explicit HTML
 * preference gets HTML. Vary plus no-store keep the CDN from serving one
 * representation as the other.
 */
function negotiate(req, res, status, json, html) {
  res.status(status);
  res.set('Cache-Control', 'no-store');
  res.set('Vary', 'Accept');
  res.format({
    json: () => res.json(json),
    html: () => res.send(html),
    default: () => res.json(json),
  });
}

app.get('/', (req, res) => {
  negotiate(
    req,
    res,
    200,
    {
      service: 'UrActor Academy Awards API',
      documentation: DEVELOPER_PORTAL_URL,
      message: 'This host serves the API only. Sign up for a key at ' + DEVELOPER_PORTAL_URL,
      endpoints: ENDPOINT_LIST,
    },
    landingPage(
      'This is an API endpoint, not a website.',
      'GET ' + ENDPOINT_LIST[1],
    ),
  );
});

app.get('/oscars/apikey=:apikey', checkApiKey, async (req, res) => {
  try {
    const ref = db.ref('/oscars');
    const snapshot = await ref.once('value');
    const data = snapshot.val();
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/oscars/year=:year/apikey=:apikey', checkApiKey, async (req, res) => {
  const year = req.params.year;
  try {
    const ref = db.ref(`/oscars/${year}`);
    const snapshot = await ref.once('value');
    const data = snapshot.val();
    if (!data) {
      res.status(404).json({ error: 'Data not found for the specified year' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/person/name=:name/apikey=:apikey', checkApiKey, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const data = await getPersonByName(name);
    if (!data.length) {
      res.status(404).json({ error: 'Person not found' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/movie/name=:name/year=:year/apikey=:apikey', checkApiKey, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const year = req.params.year;
  try {
    const data = await getMovieByNameAndYear(name, year);
    if (!data.length) {
      res.status(404).json({ error: 'Movie not found' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/award/name=:name/apikey=:apikey', checkApiKey, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const data = await getAwardByName(name);
    if (!data.length) {
      res.status(404).json({ error: 'Award not found' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.get('/award/name=:name/year=:year/apikey=:apikey', checkApiKey, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const year = req.params.year;
  try {
    const data = await getAwardByNameAndYear(name, year);
    if (!data.length) {
      res.status(404).json({ error: 'Award not found for the specified year' });
    } else {
      res.status(200).json(data);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

app.use((req, res) => {
  negotiate(
    req,
    res,
    404,
    { error: 'Not Found', documentation: DEVELOPER_PORTAL_URL },
    landingPage('That is not an endpoint on this API.', req.method + ' ' + req.path),
  );
});

exports.app = functions.https.onRequest(app);
