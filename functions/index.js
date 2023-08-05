const functions = require('firebase-functions');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Firebase Admin SDK setup
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://actordb-cf981-default-rtdb.firebaseio.com/',
});

// Define your routes
app.get('/oscars', (req, res) => {
  // Retrieve data from Firebase Realtime Database and send it as a response
  const ref = admin.database().ref('/oscars');
  ref.once('value', (snapshot) => {
    const data = snapshot.val();
    res.send(res.status(200).json(data));
  }, (error) => {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  });
});

app.get('/oscars/:year', (req, res) => {
  const year = req.params.year;
  const ref = admin.database().ref(`/oscars/${year}`);
  ref.once('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      res.status(404).json({ error: 'Data not found for the specified year' });
    } else {
      res.status(200).json(data);
    }
  }, (error) => {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Error fetching data' });
  });
});

// Export the Express app as a Firebase Function
exports.app = functions.https.onRequest(app);
