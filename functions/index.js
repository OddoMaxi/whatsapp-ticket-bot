// =============================
// IMPORTS ET INITIALISATIONS
// =============================

// Supprime l'avertissement Fontconfig (canvas)
process.env.FONTCONFIG_PATH = __dirname + '/fonts';

// Librairies serveur et utilitaires
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { requireAuth, handleLogin, handleLogout } = require('./auth');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
require('dotenv').config(); // Charge les variables d'environnement

// Import formatReservationId
const { formatReservationId } = require('./formatReservationId');

// QRCode pour générer des codes QR
const QRCode = require('qrcode');

// Remplacement de Jimp par canvas (node-canvas) pour la génération de tickets compatible Railway
// Voir doc : https://www.npmjs.com/package/canvas
const { createCanvas, loadImage, registerFont } = require('canvas');
// Enregistrement de la police custom Open Sans (embarqué dans le repo)
registerFont(path.join(__dirname, 'fonts/OpenSans-Regular.ttf'), { family: 'Open Sans' });

// PNGJS pour éventuels usages (QR, etc)
const { PNG } = require('pngjs');

// Import du bot Telegram
const telegramBot = require('./bot');


// =============================
// INITIALISATION EXPRESS & MIDDLEWARES
// =============================
const app = express();
const port = process.env.PORT || 8080;

// Middleware pour parser les requêtes POST (formulaires, JSON)
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(cors()); // Autorise les requêtes cross-origin
app.use(express.static(__dirname)); // Sert les fichiers statiques

// --- AUTHENTIFICATION ADMIN ---
const adminRouter = require('./routes/admin');
app.use('/admin', adminRouter);


// =============================
// ROUTES POUR SERVIR LES TICKETS (Twilio/WhatsApp)
// =============================
const ticketRouter = require('./routes/ticket');
app.use('/', ticketRouter);

// =============================
// ROUTES POUR L'ACHAT DE TICKETS VIA WEB
// =============================
const webPurchaseRouter = require('./routes/web-purchase');
app.use('/purchase', webPurchaseRouter);

// =============================
// BASE DE DONNÉES SQLITE (persistante en local)
// =============================
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'events.db');
const fs = require('fs');
// Crée le dossier de la base si besoin (évite les erreurs au premier lancement)
if (!fs.existsSync(path.dirname(DB_FILE))) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}
const db = new Database(__dirname + '/data.sqlite'); // Connexion à la base

db.pragma('journal_mode = WAL'); // Mode WAL pour éviter les corruptions

// Vérifier si la colonne 'code' existe dans la table 'reservations' et l'ajouter si nécessaire
try {
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
  if (tableExists) {
    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
    const codeColumnExists = columnInfo.some(col => col.name === 'code');
    if (!codeColumnExists) {
      console.log("Ajout de la colonne 'code' à la table 'reservations'...");
      db.prepare("ALTER TABLE reservations ADD COLUMN code TEXT").run();
      console.log("Colonne 'code' ajoutée avec succès.");
    }
  }
} catch (err) {
  console.error("Erreur lors de la vérification/ajout de la colonne 'code':", err);
}

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
// Ajout du paramètre price (prix du ticket)
// Ajout du paramètre formattedId (nouveau format d'ID) et qrCode (7 chiffres)
async function generateAndSendTicket({ to, channel = 'whatsapp', eventName, category, reservationId, price, formattedId, qrCode }) {
  try {
    // 1. Générer le QR code (avec l'ID réservation, encodé en JSON)
    // Utiliser qrCode pour le QR code (format demandé)
    const qrValue = qrCode || (formattedId || reservationId);
    // Si pas de code (ancien ticket), fallback sur l'ancien format
    
    // Générer le QR code en haute résolution pour plus de netteté
    const qrBuffer = await QRCode.toBuffer(qrValue, { type: 'png', width: 400 });

    // 2. Créer une image ticket verticale (300x400) avec canvas
    const width = 300, height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Fond blanc
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);

    // Charger et dessiner le logo KISSAN centré en haut
    // Utilise un chemin absolu compatible avec Canvas sous Node.js
    const logoPath = path.resolve(__dirname, 'assets', 'kissan-logo.png');
    let logoHeight = 0;
    try {
      const logoImg = await loadImage(logoPath);
      const logoWidth = 110;
      logoHeight = (logoImg.height / logoImg.width) * logoWidth;
      ctx.drawImage(logoImg, (width - logoWidth) / 2, 18, logoWidth, logoHeight);
    } catch (e) {
      // Si le logo n'est pas trouvé, ignorer
      console.warn('Logo KISSAN non trouvé ou erreur de chargement:', e);
      logoHeight = 50;
    }

    // Y de base après le logo
    let y = 18 + logoHeight + 16;

    // Centrer tous les textes
    ctx.fillStyle = '#000';
    ctx.font = 'bold 22px "Open Sans"';
    ctx.textAlign = 'center';
    ctx.fillText(`${eventName}`, width / 2, y);
    y += 38;
    ctx.font = '17px "Open Sans"';
    ctx.fillText(`Catégorie : ${category}`, width / 2, y);
    y += 26;
    ctx.font = '16px "Open Sans"';
    if (typeof price !== 'undefined') {
      ctx.fillText(`Prix : ${price} F`, width / 2, y);
      y += 24;
    }
    ctx.fillText(`ID Réservation : ${formattedId || reservationId}`, width / 2, y);

    // Centrer le QR code (horizontalement ET verticalement)
    ctx.imageSmoothingEnabled = false; // Désactive le lissage pour la netteté du QR
    const qrImg = await loadImage(qrBuffer);
    const qrSize = 140;
    // Calculer la hauteur occupée par les textes du haut (y)
    // et celle des mentions légales du bas (environ 48px)
    const topSpace = y; // y est déjà à la bonne position après les textes
    const bottomSpace = 48;
    // Espace disponible pour centrer le QR
    const availableHeight = height - topSpace - bottomSpace;
    const qrY = topSpace + (availableHeight - qrSize) / 2;
    ctx.drawImage(qrImg, (width - qrSize) / 2, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true; // Réactive le lissage pour les autres éléments

    // Optionnel : texte sous le QR
    // (Texte sous le QR supprimé à la demande de l'utilisateur)

    // Ajout des instructions légales et d'usage en tout petit, en bas du ticket
    ctx.font = '10px "Open Sans"';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    const legalLines = [
      'Ce ticket est personnel et non transférable.',
      'Veuillez présenter ce ticket (imprimé ou sur smartphone) à l’entrée de l’événement.',
      'Le QR code sera scanné à l’arrivée pour valider l’accès.',
      '⚠️ Un seul scan est autorisé par ticket.',
      'Toute reproduction ou duplication est strictement interdite.'
    ];
    let legalY = height - 48;
    for (const line of legalLines) {
      ctx.fillText(line, width / 2, legalY);
      legalY += 11;
    }

    // 5. Sauver temporairement le ticket avec compression (pour WhatsApp/Telegram)
    const filePath = `/tmp/ticket_${qrCode || formattedId || reservationId}.png`;
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
      // Ajoute contentType pour supprimer l'avertissement de dépréciation
      await telegramBot.sendPhoto(
        to,
        filePath,
        {
          caption: `Voici votre ticket pour "${eventName}" (${category})`,
          contentType: 'image/png'
        }
      );
    } else {
      // WhatsApp (Twilio)
      const twilio = require('twilio');
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        from: 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER,
        to: to,
        body: `Voici votre ticket pour "${eventName}" (${category}) :`,
        mediaUrl: [`https://${process.env.HOSTNAME || 'your-domain'}/ticket_${qrCode || formattedId || reservationId}.png`]
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
  phone TEXT,
  event_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  date TEXT NOT NULL,
  formatted_id TEXT,
  qr_code TEXT
)`);

// --- AUTHENTIFICATION ADMIN ---
app.get('/admin/login', (req, res) => {
  res.send(`
    <form method="POST" action="/admin/login" style="max-width:400px;margin:60px auto;padding:2em;background:#fff;border-radius:7px;box-shadow:0 2px 10px #0002;">
      <h2>Connexion Admin</h2>
      <input type="text" name="login" placeholder="Login" style="width:100%;padding:8px;margin-bottom:1em;" required />
      <input type="password" name="password" placeholder="Mot de passe" style="width:100%;padding:8px;margin-bottom:1em;" required />
      <button type="submit" style="width:100%;padding:8px;background:#1976d2;color:#fff;border:none;border-radius:3px;">Se connecter</button>
    </form>
  `);
});
app.post('/admin/login', handleLogin);
app.get('/admin/logout', handleLogout);

// --- Webhook WhatsApp Cloud API (Meta) ---
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});


// --- API REST admin ---

// Liste des réservations
app.get('/admin/reservations', (req, res) => {
  const rows = db.prepare('SELECT * FROM reservations ORDER BY date DESC').all();
  // Add fallback for old reservations without phone
  rows.forEach(r => { if (typeof r.phone === 'undefined') r.phone = ''; });
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
    // Confirmation : vérifie stock et redirige vers le paiement
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
        try {
          // Import du service de paiement ChapChap Pay
          const chapchapPay = require('./services/chapchap-pay');
          
          // Prix total
          const prix = cat.prix || cat.price;
          const totalPrice = prix * state.quantity;
          
          // Générer une référence unique pour ce paiement
          const reference = chapchapPay.generateTransactionId();
          
          // Préparer les données de paiement
          const paymentData = {
            amount: totalPrice,
            description: `Achat de ${state.quantity} ticket(s) pour ${event.name} - ${cat.name}`,
            reference: reference
          };
          
          console.log('Données de paiement:', JSON.stringify(paymentData));
          
          // Mettre à jour l'état de l'utilisateur pour stocker les infos de paiement
          userStates[from] = {
            ...state,
            step: 'payment_pending',
            paymentReference: reference,
            totalPrice: totalPrice,
            paymentCreatedAt: Date.now()
          };
          
          // Générer le lien de paiement
          chapchapPay.generatePaymentLink(paymentData)
            .then(paymentResponse => {
              console.log('Réponse ChapChap Pay:', JSON.stringify(paymentResponse));
              
              // Stocker l'URL de paiement dans l'état de l'utilisateur
              userStates[from].paymentUrl = paymentResponse.payment_url;
              
              // Envoyer le lien de paiement à l'utilisateur
              sendMessage(from, 
                `💸 Votre lien de paiement est prêt !\n\n` +
                `💰 Montant : ${paymentResponse.payment_amount_formatted}\n` +
                `🆔 Référence : ${reference}\n\n` +
                `⭐ Cliquez sur ce lien pour procéder au paiement :\n${paymentResponse.payment_url}\n\n` +
                `❕ Après avoir effectué le paiement, envoyez "VERIFY" pour vérifier votre paiement et générer vos tickets.`
              );
            })
            .catch(error => {
              console.error('Erreur lors de la génération du lien de paiement:', error);
              sendMessage(from, 'Une erreur est survenue lors de la génération du lien de paiement. Veuillez réessayer plus tard.');
              userStates[from] = { step: 'init' };
            });
          
          // Réponse immédiate en attendant l'API
          response = 'Génération de votre lien de paiement en cours... Veuillez patienter quelques instants.';
        } catch (error) {
          console.error('Erreur dans le processus de paiement:', error);
          response = 'Une erreur est survenue. Veuillez réessayer plus tard.';
          userStates[from] = { step: 'init' };
        }
      }
    }
  } else if (state.step === 'payment_pending' && /^verify$/i.test(msg)) {
    // Vérification du statut du paiement
    try {
      // Import du service de paiement ChapChap Pay
      const chapchapPay = require('./services/chapchap-pay');
      
      if (!state.paymentReference) {
        response = 'Aucune référence de paiement trouvée. Veuillez recommencer l\'achat.';
        userStates[from] = { step: 'init' };
        return;
      }
      
      response = 'Vérification de votre paiement en cours... Veuillez patienter quelques instants.';
      
      // Vérifier le statut du paiement
      chapchapPay.checkPaymentStatus(state.paymentReference)
        .then(paymentStatus => {
          console.log('Statut de paiement:', JSON.stringify(paymentStatus));
          
          if (paymentStatus.status === 'completed' || paymentStatus.status === 'paid') {
            // Paiement réussi, procéder à la génération des tickets
            const event = db.prepare('SELECT * FROM events WHERE id=?').get(state.event.id);
            let cats = JSON.parse(event.categories);
            let catIdx = cats.findIndex(c => c.name === state.category.name);
            let cat = cats[catIdx];
            const prix = cat.prix || cat.price;
            
            sendMessage(from, 'Paiement confirmé ! Génération de vos tickets en cours...');
            
            // Décrémenter le stock maintenant que le paiement est confirmé
            cat.quantite = (cat.quantite || cat.quantity) - state.quantity;
            cats[catIdx] = cat;
            db.prepare('UPDATE events SET categories=? WHERE id=?').run(JSON.stringify(cats), event.id);
            
            // Générer les tickets maintenant que le paiement est confirmé
            for (let i = 0; i < state.quantity; i++) {
              try {
                // Chaque ticket a sa propre réservation (quantity = 1)
                const rsvInfo = db.prepare(`INSERT INTO reservations (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, date, payment_reference)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`).run(
                  from, req.body.From, event.id, event.name, cat.name, 1, prix, prix, state.paymentReference
                );

                // Calculer le numéro de ticket séquentiel pour cet event/cat
                const previousTickets = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE event_id=? AND category_name=?').get(event.id, cat.name);
                const ticketNum = (previousTickets.count || 0) + 1;

                // Constant for QR code length
                const QR_CODE_LENGTH = 7;

                let categoriesArr = event.categories;
                if (typeof categoriesArr === 'string') {
                  try {
                    categoriesArr = JSON.parse(categoriesArr);
                  } catch (e) {
                    console.error('Erreur de parsing event.categories:', event.categories, e);
                    categoriesArr = [];
                  }
                }

                const catIdxForId = Array.isArray(categoriesArr) ? categoriesArr.findIndex(c => c.name === cat.name) : -1;
                const formattedId = formatReservationId(event.id, catIdxForId, ticketNum);

                // Générer un code QR unique de QR_CODE_LENGTH chiffres
                let qrCode;
                let maxAttempts = 10;
                let attempts = 0;
                do {
                  qrCode = String(Math.floor(Math.pow(10, QR_CODE_LENGTH - 1) + Math.random() * (Math.pow(10, QR_CODE_LENGTH) - Math.pow(10, QR_CODE_LENGTH - 1))));
                  attempts++;
                  if (attempts > maxAttempts) {
                    console.error('Impossible de générer un QR code unique après plusieurs tentatives.');
                    break;
                  }
                } while (db.prepare('SELECT 1 FROM reservations WHERE qr_code = ?').get(qrCode));

                if (
                  catIdxForId === undefined || catIdxForId === -1 ||
                  formattedId === undefined || !qrCode || attempts > maxAttempts
                ) {
                  console.error('Paramètre manquant ou invalide (WhatsApp):', {
                    catIdx: catIdxForId, formattedId, qrCode, from, eventName: event.name, category: cat.name, reservationId: rsvInfo.lastInsertRowid
                  });
                } else {
                  try {
                    // Vérifier si la colonne code existe avant de l'utiliser
                    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
                    const codeColumnExists = columnInfo.some(col => col.name === 'code');
                    
                    if (codeColumnExists) {
                      db.prepare('UPDATE reservations SET formatted_id=?, qr_code=?, code=?, payment_status=? WHERE id=?').run(formattedId, qrCode, formattedId, 'paid', rsvInfo.lastInsertRowid);
                    } else {
                      db.prepare('UPDATE reservations SET formatted_id=?, qr_code=?, payment_status=? WHERE id=?').run(formattedId, qrCode, 'paid', rsvInfo.lastInsertRowid);
                    }
                  } catch (err) {
                    console.error("Erreur lors de la mise à jour de la réservation:", err);
                    // Fallback en cas d'erreur
                    db.prepare('UPDATE reservations SET formatted_id=?, qr_code=? WHERE id=?').run(formattedId, qrCode, rsvInfo.lastInsertRowid);
                  }
                  setTimeout(() => {
                    try {
                      generateAndSendTicket({
                        to: from,
                        eventName: event.name,
                        category: cat.name,
                        reservationId: rsvInfo.lastInsertRowid,
                        formattedId,
                        qrCode
                      });
                    } catch (err) {
                      console.error('Erreur lors de l'appel à generateAndSendTicket (WhatsApp):', {
                        catIdx: catIdxForId, formattedId, qrCode, from, eventName: event.name, category: cat.name, reservationId: rsvInfo.lastInsertRowid, err
                      });
                    }
                  }, 0);
                }
              } catch (err) {
                console.error('Erreur lors de la génération du ticket (WhatsApp, boucle):', err);
              }
            }

            // After the for loop, set the response and user state
            response = `Merci ! Votre réservation de ${state.quantity} ticket(s) pour "${event.name}" en catégorie "${cat.name}" est confirmée.\nVos tickets vous sont envoyés par WhatsApp.\nTapez "menu" pour recommencer.`;
            userStates[from] = { step: 'init' };
          } else {
            // Paiement non réussi ou en attente
            sendMessage(from, `Le paiement n'est pas encore confirmé. Statut actuel: ${paymentStatus.status}.\nVeuillez finaliser votre paiement puis envoyer "VERIFY" pour vérifier à nouveau.`);
          }
        })
        .catch(error => {
          console.error('Erreur lors de la vérification du statut de paiement:', error);
          sendMessage(from, 'Une erreur est survenue lors de la vérification de votre paiement. Veuillez réessayer plus tard en envoyant "VERIFY".');
        });
    } catch (error) {
      console.error('Erreur dans le processus de vérification de paiement:', error);
      response = 'Une erreur est survenue. Veuillez réessayer plus tard.';
    }

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
      // Enregistre une réservation et génère un ticket POUR CHAQUE place réservée
      const prix = cat.prix || cat.price;
      for (let i = 0; i < state.quantity; i++) {
        try {
          // Chaque ticket a sa propre réservation (quantity = 1)
          const rsvInfo = db.prepare(`INSERT INTO reservations (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
              userId, '', event.id, event.name, cat.name, 1, prix, prix
          );
          // Calculer le numéro de ticket séquentiel pour cet event/cat
          const previousTickets = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE event_id=? AND category_name=?').get(event.id, cat.name);
          const ticketNum = (previousTickets.count || 0) + 1;
          // S'assurer que event.categories est bien un tableau
          let categoriesArr = event.categories;
          if (typeof categoriesArr === 'string') {
            try {
              categoriesArr = JSON.parse(categoriesArr);
            } catch (e) {
              console.error('Erreur de parsing event.categories:', event.categories, e);
              categoriesArr = [];
            }
          }
          const catIdx = Array.isArray(categoriesArr) ? categoriesArr.findIndex(c => c.name === cat.name) : -1;
          const formattedId = formatReservationId(event.id, catIdx, ticketNum);
          // Générer un code QR unique de 7 chiffres
          let qrCode;
          do {
            qrCode = String(Math.floor(1000000 + Math.random() * 9000000));
          } while (db.prepare('SELECT 1 FROM reservations WHERE qr_code = ?').get(qrCode));
          try {
        // Vérifier si la colonne code existe avant de l'utiliser
        const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
        const codeColumnExists = columnInfo.some(col => col.name === 'code');
        
        if (codeColumnExists) {
          db.prepare('UPDATE reservations SET formatted_id=?, qr_code=?, code=? WHERE id=?').run(formattedId, qrCode, formattedId, rsvInfo.lastInsertRowid);
        } else {
          db.prepare('UPDATE reservations SET formatted_id=?, qr_code=? WHERE id=?').run(formattedId, qrCode, rsvInfo.lastInsertRowid);
        }
      } catch (err) {
        console.error("Erreur lors de la mise à jour de la réservation:", err);
        // Fallback en cas d'erreur
        db.prepare('UPDATE reservations SET formatted_id=?, qr_code=? WHERE id=?').run(formattedId, qrCode, rsvInfo.lastInsertRowid);
      }
          setTimeout(() => {
            try {
              if (catIdx === undefined || formattedId === undefined || qrCode === undefined) {
                console.error('Paramètre manquant (Telegram):', {catIdx, formattedId, qrCode, userId, eventName: event.name, category: cat.name, reservationId: rsvInfo.lastInsertRowid});
              }
              generateAndSendTicket({
                to: userId,
                channel: 'telegram',
                eventName: event.name,
                category: cat.name,
                reservationId: rsvInfo.lastInsertRowid,
                formattedId,
                qrCode
              });
            } catch (err) {
              console.error('Erreur lors de l’appel à generateAndSendTicket (Telegram):', {
                catIdx, formattedId, qrCode, userId, eventName: event.name, category: cat.name, reservationId: rsvInfo.lastInsertRowid, err
              });
            }
          }, 0);
        } catch (err) {
          console.error('Erreur lors de la génération du ticket (Telegram, boucle):', err);
        }
      }
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
