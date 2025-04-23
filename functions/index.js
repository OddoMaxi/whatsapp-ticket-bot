const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware pour parser les données reçues de Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// --- Gestion d'un menu de vente de tickets ---
const events = [
  { id: 1, name: 'Concert' },
  { id: 2, name: 'Théâtre' },
  { id: 3, name: 'Conférence' }
];
// Stockage temporaire de l'état des utilisateurs (par numéro)
const userStates = {};

app.post('/webhook', (req, res) => {
  const msg = (req.body.Body || '').trim();
  const from = req.body.From;
  let response = '';

  // Initialiser l'état si inconnu
  if (!userStates[from]) {
    userStates[from] = { step: 'init' };
  }
  const state = userStates[from];

  // Log du message reçu
  console.log(`Message de ${from}: ${msg}`);

  // Logique du menu
  if (/^menu$/i.test(msg)) {
    // Afficher le menu des événements
    state.step = 'choose_event';
    response = 'Bienvenue ! Quel événement vous intéresse ?\n';
    events.forEach(ev => {
      response += `${ev.id}. ${ev.name}\n`;
    });
    response += '\nRépondez par le numéro de l\'événement.';
  } else if (state.step === 'choose_event' && /^[1-3]$/.test(msg)) {
    // Choix de l'événement
    const event = events.find(ev => ev.id === parseInt(msg));
    if (event) {
      state.event = event;
      state.step = 'choose_quantity';
      response = `Combien de tickets voulez-vous pour "${event.name}" ?`;
    } else {
      response = 'Numéro d\'événement invalide. Merci de réessayer.';
    }
  } else if (state.step === 'choose_quantity' && /^\d+$/.test(msg)) {
    // Choix du nombre de tickets
    const quantity = parseInt(msg);
    if (quantity > 0) {
      state.quantity = quantity;
      state.step = 'confirm';
      response = `Vous avez choisi ${quantity} ticket(s) pour "${state.event.name}".\nRépondez "oui" pour confirmer ou "menu" pour recommencer.`;
    } else {
      response = 'Merci d\'indiquer un nombre valide.';
    }
  } else if (state.step === 'confirm' && /^oui$/i.test(msg)) {
    // Confirmation
    response = `Merci ! Votre réservation de ${state.quantity} ticket(s) pour "${state.event.name}" est prise en compte.\nTapez "menu" pour recommencer.`;
    userStates[from] = { step: 'init' };
  } else {
    // Message par défaut
    response = 'Bienvenue sur le bot de vente de tickets ! Tapez "menu" pour commencer.';
    userStates[from] = { step: 'init' };
  }

  res.set('Content-Type', 'text/xml');
  res.send(`
    <Response>
      <Message>${response}</Message>
    </Response>
  `);
});

// Lancement du serveur
app.listen(port, () => {
  console.log(`✅ Bot WhatsApp actif sur le port ${port}`);
});
