const functions = require('firebase-functions');
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

app.get('/', (req, res) => {
  res.status(200).json({
    service: 'UrActor Academy Awards API',
    documentation: DEVELOPER_PORTAL_URL,
    message: 'Sign up for an API key at ' + DEVELOPER_PORTAL_URL,
    endpoints: [
      '/oscars/apikey=YOUR_API_KEY',
      '/oscars/year={year}/apikey=YOUR_API_KEY',
      '/person/name={name}/apikey=YOUR_API_KEY',
      '/movie/name={name}/year={year}/apikey=YOUR_API_KEY',
      '/award/name={name}/apikey=YOUR_API_KEY',
      '/award/name={name}/year={year}/apikey=YOUR_API_KEY',
    ],
  });
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
  res.status(404).json({
    error: 'Not Found',
    documentation: DEVELOPER_PORTAL_URL,
  });
});

exports.app = functions.https.onRequest(app);
