// =============================
// IMPORTS ET INITIALISATIONS
// =============================

// Librairies serveur et utilitaires
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
require('dotenv').config(); // Charge les variables d'environnement

// QRCode pour générer des codes QR
const QRCode = require('qrcode');

// Remplacement de Jimp par canvas (node-canvas) pour la génération de tickets compatible Railway
// Voir doc : https://www.npmjs.com/package/canvas
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
// Enregistrement de la police custom Open Sans (embarqué dans le repo)
registerFont(path.join(__dirname, 'fonts/OpenSans-Regular.ttf'), { family: 'Open Sans' });

// PNGJS pour éventuels usages (QR, etc)
const { PNG } = require('pngjs');

// Telegram Bot API
const TelegramBot = require('node-telegram-bot-api');

// =============================
// INITIALISATION DU BOT TELEGRAM
// =============================
// polling: true => le bot écoute les messages entrants (mode développement ou prod unique)
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); // polling activé pour recevoir les messages

// =============================
// INITIALISATION EXPRESS & MIDDLEWARES
// =============================
const app = express();
const port = process.env.PORT || 8080;

// Middleware pour parser les requêtes POST (formulaires, JSON)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors()); // Autorise les requêtes cross-origin
app.use(express.static(__dirname)); // Sert les fichiers statiques

// =============================
// ROUTE POUR SERVIR LES TICKETS (Twilio/WhatsApp)
// =============================
app.get('/ticket_:id.png', (req, res) => {
  const filePath = `/tmp/ticket_${req.params.id}.png`;
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Ticket introuvable');
  });
});

// =============================
// BASE DE DONNÉES SQLITE (persistante en local)
// =============================
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'events.db');
const fs = require('fs');
// Crée le dossier de la base si besoin (évite les erreurs au premier lancement)
if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}
const db = new Database(DB_FILE); // Connexion à la base

db.pragma('journal_mode = WAL'); // Mode WAL pour éviter les corruptions

// Gestion des erreurs globales (meilleur debug)
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

// =============================
// FONCTION : Génère et envoie un ticket image (QR + infos)
// =============================
// Utilisé pour WhatsApp ET Telegram
// Paramètres : to = userId, channel = 'telegram' ou 'whatsapp', eventName, category, reservationId
async function generateAndSendTicket({ to, channel = 'whatsapp', eventName, category, reservationId }) {
  try {
    // 1. Générer le QR code (avec l'ID réservation, encodé en JSON)
    const qrValue = JSON.stringify({ reservationId, eventName, category });
    const qrBuffer = await QRCode.toBuffer(qrValue, { type: 'png', width: 120 });

    // 2. Créer une image ticket blanche compacte (320x180) avec canvas
    const width = 320, height = 180;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fond blanc
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // 3. Ecrire les infos sur le ticket (texte, police custom Open Sans)
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px "Open Sans"';
    ctx.fillText(`Evénement : ${eventName}`, 10, 30);
    ctx.fillText(`Catégorie : ${category}`, 10, 60);

    // 4. Insérer le QR code (redimensionné)
    // On charge le buffer QR comme image
    const qrImg = await loadImage(qrBuffer);
    ctx.drawImage(qrImg, width - 100, height - 100, 90, 90);

    // 5. Sauver temporairement le ticket avec compression (pour WhatsApp/Telegram)
    const filePath = `/tmp/ticket_${reservationId}.png`;
    const fs = require('fs');
    // Compression PNG (canvas)
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));

    // 6. Vérifier la taille et réduire si besoin (WhatsApp limite à ~50ko)
    let stats = fs.statSync(filePath);
    if (stats.size > 50000) {
      // Dernier recours : resize plus petit si > 50ko
      await image.resize(240, 135).quality(60).writeAsync(filePath);
    }
    // 4. Envoi sur le bon canal
    if (channel === 'telegram') {
      await telegramBot.sendPhoto(
        to,
        filePath,
        { caption: `Voici votre ticket pour "${eventName}" (${category})` }
      );
    } else {
      // WhatsApp (Twilio)
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: to,
        body: `Voici votre ticket pour "${eventName}" (${category}) :`,
        mediaUrl: [`https://${process.env.HOSTNAME || 'your-domain'}/ticket_${reservationId}.png`]
      });
    }
    // 5. Optionnel : tu pourrais supprimer le fichier après envoi
  } catch (err) {
    console.error('Erreur génération/envoi ticket:', err);
    // En cas d'erreur Telegram, loggue tout
  }
}


db.exec(`CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  organizer TEXT NOT NULL,
  location TEXT NOT NULL,
  categories TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user TEXT NOT NULL,
  event_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  date TEXT NOT NULL
)`);

// --- API REST admin ---

// Liste des réservations
app.get('/admin/reservations', (req, res) => {
  const rows = db.prepare('SELECT * FROM reservations ORDER BY date DESC').all();
  res.json(rows);
});

// Tableau de bord tickets
app.get('/admin/dashboard', (req, res) => {
  // Pour chaque événement et catégorie : tickets vendus, restants, total ventes
  const events = db.prepare('SELECT * FROM events').all().map(ev => ({ ...ev, categories: JSON.parse(ev.categories) }));
  const reservations = db.prepare('SELECT * FROM reservations').all();
  const dashboard = events.map(ev => {
    const cats = ev.categories.map(cat => {
      // Tickets vendus pour cette catégorie
      const sold = reservations.filter(r => r.event_id === ev.id && r.category_name === cat.name)
        .reduce((sum, r) => sum + r.quantity, 0);
      const total = cat.quantite !== undefined ? (cat.quantite + sold) : (cat.quantity !== undefined ? (cat.quantity + sold) : 0);
      const left = total - sold;
      const sales = reservations.filter(r => r.event_id === ev.id && r.category_name === cat.name)
        .reduce((sum, r) => sum + r.total_price, 0);
      return {
        name: cat.name,
        price: cat.prix || cat.price,
        total,
        sold,
        left,
        sales
      };
    });
    return {
      event_id: ev.id,
      event_name: ev.name,
      categories: cats
    };
  });
  res.json(dashboard);
});

app.get('/admin/events', (req, res) => {
  const rows = db.prepare('SELECT * FROM events').all();
  const events = rows.map(ev => ({ ...ev, categories: JSON.parse(ev.categories) }));
  res.json(events);
});

app.post('/admin/events', (req, res) => {
  const { name, date, organizer, location, categories } = req.body;
  const stmt = db.prepare('INSERT INTO events (name, date, organizer, location, categories) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(name, date, organizer, location, JSON.stringify(categories));
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
  event.categories = JSON.parse(event.categories);
  res.status(201).json(event);
});

app.put('/admin/events/:id', (req, res) => {
  const { name, date, organizer, location, categories } = req.body;
  const stmt = db.prepare('UPDATE events SET name=?, date=?, organizer=?, location=?, categories=? WHERE id=?');
  const info = stmt.run(name, date, organizer, location, JSON.stringify(categories), req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  event.categories = JSON.parse(event.categories);
  res.json(event);
});

app.delete('/admin/events/:id', (req, res) => {
  const event = db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  event.categories = JSON.parse(event.categories);
  res.json(event);
});

// --- Gestion d'un menu de vente de tickets (WhatsApp) ---
function getEventsForBot() {
  return db.prepare('SELECT * FROM events').all().map(ev => ({ ...ev, categories: JSON.parse(ev.categories) }));
}

// Stockage temporaire de l'état des utilisateurs (par canal+id)
const userStates = {}; // ex: { whatsapp:+22507xxxx: {step:...}, telegram:5690412192: {step:...} }

function getUserKey(channel, id) {
  return `${channel}:${id}`;
}

app.post('/webhook', (req, res) => {
  const msg = (req.body.Body || '').trim();
  const from = req.body.From;
  let response = '';
  const userKey = getUserKey('whatsapp', from);

  // Initialiser l'état si inconnu
  if (!userStates[userKey]) {
    userStates[userKey] = { step: 'init' };
  }
  const state = userStates[userKey];

  // Log du message reçu
  console.log(`[WhatsApp] Message de ${from}: ${msg}`);

  // Logique du menu
  const events = getEventsForBot();
  if (/^menu$/i.test(msg)) {
    // Afficher le menu des événements dynamiquement
    if (!events.length) {
      response = 'Aucun événement disponible pour le moment.';
      state.step = 'init';
    } else {
      state.step = 'choose_event';
      response = 'Bienvenue ! Quel événement vous intéresse ?\n';
      events.forEach(ev => {
        response += `${ev.id}. ${ev.name}\n`;
        ev.categories.forEach((cat, idx) => {
          response += `   - ${idx+1}. ${cat.name} (${cat.prix || cat.price}F, ${cat.quantite || cat.quantity} places)\n`;
        });
      });
      response += '\nRépondez par le numéro de l\'événement.';
    }
  } else if (state.step === 'choose_event' && /^\d+$/.test(msg)) {
    try {
      // Choix de l'événement par ID dynamique
      const event = events.find(ev => ev.id == parseInt(msg));
      console.log('Choix event:', event); // Debug
      if (event) {
        state.event = event;
        state.step = 'choose_category';
        // Afficher les catégories pour cet événement
        response = `Catégories disponibles pour "${event.name}" :\n`;
        event.categories.forEach((cat, idx) => {
          const dispo = (cat.quantite !== undefined ? cat.quantite : cat.quantity);
          if (dispo < 1) {
            response += `${idx+1}. ${cat.name} : Rupture de stock\n`;
          } else {
            response += `${idx+1}. ${cat.name} (${cat.prix || cat.price}F, ${dispo} places)\n`;
          }
        });
        response += '\nRépondez par le numéro de la catégorie.';
      } else {
        response = 'Numéro d\'événement invalide. Merci de réessayer.';
      }
    } catch (e) {
      console.error("Erreur lors du choix d'événement:", e);
      response = "Erreur interne lors du choix de l'événement. Merci de réessayer ou contacter l'admin.";
      userStates[from] = { step: 'init' };
    }
  
  } else if (state.step === 'choose_category' && /^\d+$/.test(msg)) {
    // Choix de la catégorie par numéro
    const cats = state.event.categories;
    const catIdx = parseInt(msg) - 1;
    if (cats && cats[catIdx]) {
      const dispo = (cats[catIdx].quantite !== undefined ? cats[catIdx].quantite : cats[catIdx].quantity);
      if (dispo < 1) {
        response = `Désolé, la catégorie "${cats[catIdx].name}" est en rupture de stock. Merci de choisir une autre catégorie.`;
      } else {
        state.category = cats[catIdx];
        state.step = 'choose_quantity';
        response = `Combien de tickets voulez-vous pour la catégorie "${state.category.name}" à ${state.category.prix || state.category.price}F l'unité ?`;
      }
    } else {
      response = 'Numéro de catégorie invalide. Merci de réessayer.';
    }
  } else if (state.step === 'choose_quantity' && /^\d+$/.test(msg)) {
    // Choix du nombre de tickets
    const quantity = parseInt(msg);
    if (quantity > 0 && state.category) {
      state.quantity = quantity;
      state.step = 'confirm';
      const prix = state.category.prix || state.category.price;
      const total = prix * quantity;
      response = `Vous avez choisi ${quantity} ticket(s) pour "${state.event.name}" en catégorie "${state.category.name}" (${prix}F l'unité).\nTotal à payer : ${total}F.\nRépondez "oui" pour confirmer ou "menu" pour recommencer.`;
    } else {
      response = 'Merci d\'indiquer un nombre valide.';
    }
  } else if (state.step === 'confirm' && /^oui$/i.test(msg)) {
    // Confirmation : vérifie stock, décrémente, enregistre
    const event = db.prepare('SELECT * FROM events WHERE id=?').get(state.event.id);
    if (!event) {
      response = 'Erreur : événement introuvable.';
      userStates[from] = { step: 'init' };
    } else {
      let cats = JSON.parse(event.categories);
      let catIdx = cats.findIndex(c => c.name === state.category.name);
      let cat = cats[catIdx];
      if (!cat) {
        response = 'Erreur : catégorie introuvable.';
        userStates[userKey] = { step: 'init' };
      } else if ((cat.quantite || cat.quantity) < state.quantity) {
        response = `Désolé, il ne reste que ${cat.quantite || cat.quantity} places pour cette catégorie.`;
        // On reste à l'étape de quantité
      } else {
        // Décrémente le stock
        cat.quantite = (cat.quantite || cat.quantity) - state.quantity;
        cats[catIdx] = cat;
        db.prepare('UPDATE events SET categories=? WHERE id=?').run(JSON.stringify(cats), event.id);
        // Enregistre la réservation
        const prix = cat.prix || cat.price;
        const total = prix * state.quantity;
        const rsvInfo = db.prepare(`INSERT INTO reservations (user, event_id, event_name, category_name, quantity, unit_price, total_price, date)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
            from, event.id, event.name, cat.name, state.quantity, prix, total
        );
        // Générer et envoyer le ticket image avec QR code
        setTimeout(() => generateAndSendTicket({
          to: from,
          eventName: event.name,
          category: cat.name,
          reservationId: rsvInfo.lastInsertRowid
        }), 0);
        response = `Merci ! Votre réservation de ${state.quantity} ticket(s) pour "${event.name}" en catégorie "${cat.name}" est confirmée.\nVotre ticket va vous être envoyé dans quelques instants par WhatsApp.\nTapez "menu" pour recommencer.`;
        userStates[userKey] = { step: 'init' };
      }
    }
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

// --- Telegram: gestion du flux conversationnel ---
telegramBot.on('message', async (msg) => {
  const userId = msg.from.id;
  const text = (msg.text || '').trim();
  const userKey = getUserKey('telegram', userId);
  let response = '';

  // Initialiser l'état si inconnu
  if (!userStates[userKey]) {
    userStates[userKey] = { step: 'init' };
  }
  const state = userStates[userKey];

  // Log du message reçu
  console.log(`[Telegram] Message de ${userId}: ${text}`);

  // Logique du menu
  const events = getEventsForBot();
  if (/^menu$/i.test(text)) {
    if (!events.length) {
      response = 'Aucun événement disponible pour le moment.';
      state.step = 'init';
    } else {
      state.step = 'choose_event';
      response = 'Bienvenue ! Quel événement vous intéresse ?\n';
      events.forEach(ev => {
        response += `${ev.id}. ${ev.name}\n`;
        ev.categories.forEach((cat, idx) => {
          response += `   - ${idx+1}. ${cat.name} (${cat.prix || cat.price}F, ${cat.quantite || cat.quantity} places)\n`;
        });
      });
      response += '\nRépondez par le numéro de l\'événement.';
    }
    await telegramBot.sendMessage(userId, response);
    return;
  }

  if (state.step === 'choose_event' && /^\d+$/.test(text)) {
    try {
      const event = events.find(ev => ev.id == parseInt(text));
      if (event) {
        state.event = event;
        state.step = 'choose_category';
        response = `Catégories disponibles pour "${event.name}" :\n`;
        event.categories.forEach((cat, idx) => {
          const dispo = (cat.quantite !== undefined ? cat.quantite : cat.quantity);
          if (dispo < 1) {
            response += `${idx+1}. ${cat.name} : Rupture de stock\n`;
          } else {
            response += `${idx+1}. ${cat.name} (${cat.prix || cat.price}F, ${dispo} places)\n`;
          }
        });
        response += '\nRépondez par le numéro de la catégorie.';
      } else {
        response = 'Numéro d\'événement invalide. Merci de réessayer.';
      }
    } catch (e) {
      console.error("[Telegram] Erreur lors du choix d'événement:", e);
      response = "Erreur interne lors du choix de l'événement. Merci de réessayer ou contacter l'admin.";
      userStates[userKey] = { step: 'init' };
    }
    await telegramBot.sendMessage(userId, response);
    return;
  }
  if (state.step === 'choose_category' && /^\d+$/.test(text)) {
    const cats = state.event.categories;
    const catIdx = parseInt(text) - 1;
    if (cats && cats[catIdx]) {
      const dispo = (cats[catIdx].quantite !== undefined ? cats[catIdx].quantite : cats[catIdx].quantity);
      if (dispo < 1) {
        response = `Désolé, la catégorie "${cats[catIdx].name}" est en rupture de stock. Merci de choisir une autre catégorie.`;
      } else {
        state.category = cats[catIdx];
        state.step = 'choose_quantity';
        response = `Combien de tickets voulez-vous pour la catégorie "${state.category.name}" à ${state.category.prix || state.category.price}F l'unité ?`;
      }
    } else {
      response = 'Numéro de catégorie invalide. Merci de réessayer.';
    }
    await telegramBot.sendMessage(userId, response);
    return;
  }
  if (state.step === 'choose_quantity' && /^\d+$/.test(text)) {
    const quantity = parseInt(text);
    if (quantity > 0 && state.category) {
      state.quantity = quantity;
      state.step = 'confirm';
      const prix = state.category.prix || state.category.price;
      const total = prix * quantity;
      response = `Vous avez choisi ${quantity} ticket(s) pour "${state.event.name}" en catégorie "${state.category.name}" (${prix}F l'unité).\nTotal à payer : ${total}F.\nRépondez "oui" pour confirmer ou "menu" pour recommencer.`;
    } else {
      response = 'Merci d\'indiquer un nombre valide.';
    }
    await telegramBot.sendMessage(userId, response);
    return;
  }
  if (state.step === 'confirm' && /^oui$/i.test(text)) {
    // Confirmation : vérifie stock, décrémente, enregistre
    const event = db.prepare('SELECT * FROM events WHERE id=?').get(state.event.id);
    if (!event) {
      response = 'Erreur : événement introuvable.';
      userStates[userKey] = { step: 'init' };
      await telegramBot.sendMessage(userId, response);
      return;
    }
    let cats = JSON.parse(event.categories);
    let catIdx = cats.findIndex(c => c.name === state.category.name);
    let cat = cats[catIdx];
    if (!cat) {
      response = 'Erreur : catégorie introuvable.';
      userStates[userKey] = { step: 'init' };
      await telegramBot.sendMessage(userId, response);
      return;
    } else if ((cat.quantite || cat.quantity) < state.quantity) {
      response = `Désolé, il ne reste que ${cat.quantite || cat.quantity} places pour cette catégorie.`;
      await telegramBot.sendMessage(userId, response);
      return;
    } else {
      // Décrémente le stock
      cat.quantite = (cat.quantite || cat.quantity) - state.quantity;
      cats[catIdx] = cat;
      db.prepare('UPDATE events SET categories=? WHERE id=?').run(JSON.stringify(cats), event.id);
      // Enregistre la réservation
      const prix = cat.prix || cat.price;
      const total = prix * state.quantity;
      const rsvInfo = db.prepare(`INSERT INTO reservations (user, event_id, event_name, category_name, quantity, unit_price, total_price, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
            userId, event.id, event.name, cat.name, state.quantity, prix, total
      );
      // Générer et envoyer le ticket image avec QR code
      setTimeout(() => generateAndSendTicket({
        to: userId,
        channel: 'telegram',
        eventName: event.name,
        category: cat.name,
        reservationId: rsvInfo.lastInsertRowid
      }), 0);
      response = `Merci ! Votre réservation de ${state.quantity} ticket(s) pour "${event.name}" en catégorie "${cat.name}" est confirmée.\nVotre ticket va vous être envoyé dans quelques instants par Telegram.\nTapez "menu" pour recommencer.`;
      userStates[userKey] = { step: 'init' };
      await telegramBot.sendMessage(userId, response);
      return;
    }
  }
  // Message par défaut Telegram
  await telegramBot.sendMessage(userId, 'Bienvenue sur le bot de vente de tickets ! Tapez "menu" pour commencer.');
});

// Lancement du serveur
app.listen(port, () => {
  console.log(`✅ Bot WhatsApp actif sur le port ${port}`);
});
