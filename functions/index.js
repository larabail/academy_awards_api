const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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
    for (const categoryData of data[year]) {
      for (const nomination of categoryData.nominations) {
        if (nomination.primary.includes(name)) {
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
  for (const categoryData of data) {
    for (const nomination of categoryData.nominations) {
      if (nomination.primary.includes(name)) {
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
    for (const categoryData of data[year]) {
      if (categoryData.category.includes(name)) {
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
  for (const categoryData of data) {
    if (categoryData.category.includes(name)) {
      result.push({ category: categoryData.category, nominations: categoryData.nominations });
    }
  }
  return result;
}

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
  const apikey = req.params.apikey
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
  const apikey = req.params.apikey
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
  const apikey = req.params.apikey
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
  const apikey = req.params.apikey
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
  const apikey = req.params.apikey
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

exports.app = functions.https.onRequest(app);
