const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware pour parser les données reçues de Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// Point d'entrée Webhook de Twilio
app.post('/webhook', (req, res) => {
  const msg = req.body.Body;
  const from = req.body.From;

  console.log(`Message de ${from}: ${msg}`);

  // Exemple de réponse automatisée
  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Message>Merci pour votre message !</Message>
    </Response>
  `);
});

// Lancement du serveur
app.listen(port, () => {
  console.log(`✅ Bot WhatsApp actif sur le port ${port}`);
});
