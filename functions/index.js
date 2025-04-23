const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware pour parser JSON, urlencoded, CORS
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// --- Gestion des événements (stockés dans events.json) ---
const EVENTS_FILE = path.join(__dirname, 'events.json');

function readEvents() {
  try {
    return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}
function writeEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

// --- API REST admin ---
app.get('/admin/events', (req, res) => {
  res.json(readEvents());
});

app.post('/admin/events', (req, res) => {
  const events = readEvents();
  const newEvent = req.body;
  newEvent.id = Date.now();
  events.push(newEvent);
  writeEvents(events);
  res.status(201).json(newEvent);
});

app.put('/admin/events/:id', (req, res) => {
  const events = readEvents();
  const idx = events.findIndex(e => e.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  events[idx] = { ...events[idx], ...req.body, id: events[idx].id };
  writeEvents(events);
  res.json(events[idx]);
});

app.delete('/admin/events/:id', (req, res) => {
  let events = readEvents();
  const idx = events.findIndex(e => e.id == req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const deleted = events.splice(idx, 1);
  writeEvents(events);
  res.json(deleted[0]);
});

// --- Gestion d'un menu de vente de tickets (WhatsApp) ---
let events = readEvents();
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
