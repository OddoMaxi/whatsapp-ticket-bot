/**
 * Routes pour la fonctionnalité d'achat de tickets via interface web
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { formatReservationId } = require('../formatReservationId');
const router = express.Router();
const db = new Database(path.join(__dirname, '../data.sqlite'));
const axios = require('axios'); // Ajout d'axios pour les requêtes HTTP

// Middleware pour vérifier l'authentification
const checkAuth = (req, res, next) => {
  const sessionToken = req.query.token || req.headers['x-session-token'];
  
  console.log('Vérification d\'authentification - Token reçu:', sessionToken);
  
  if (!sessionToken) {
    console.log('Erreur d\'authentification: Aucun token fourni');
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  try {
    // Vérifier si la session existe et est valide
    const session = db.prepare(`
      SELECT * FROM user_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).get(sessionToken);
    
    console.log('Résultat de la vérification de session:', session ? 'Session valide' : 'Session invalide ou expirée');
    
    if (!session) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    
    // Ajouter les informations de session à la requête
    req.session = session;
    console.log('Authentification réussie pour le numéro:', session.phone);
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de session:', error);
    return res.status(500).json({ error: 'Erreur lors de la vérification de session' });
  }
};

// Fonction pour envoyer un SMS via l'API fournie
async function sendSMS(phoneNumber, message) {
  try {
    // Configuration de l'API SMS
    const smsConfig = {
      username: 'kissan',
      token: '76d8c1a8d3ecea11cdb224c9ab0e9ae0',
      sender: 'LASSIRI'
    };
    
    // S'assurer que le numéro de téléphone est au bon format (sans espaces ni caractères spéciaux)
    const cleanPhoneNumber = phoneNumber.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    
    // Formater le message (encoder pour URL)
    const formattedMessage = encodeURIComponent(message);
    
    // Construire l'URL de l'API
    const url = `http://sms.interactgroup.net/index.php?app=ws&u=${smsConfig.username}&h=${smsConfig.token}&op=pv&to=${cleanPhoneNumber}&msg=${formattedMessage}&from=${smsConfig.sender}`;
    
    console.log('URL API SMS:', url);
    
    // Envoyer la requête HTTP
    const response = await axios.get(url);
    
    console.log('Réponse API SMS:', response.data);
    
    // Vérifier si l'envoi a réussi en fonction de la réponse de l'API
    // La réponse contient un tableau 'data'
    if (response.data && Array.isArray(response.data.data) && response.data.data.length > 0 && response.data.data[0].status === 'OK') {
      return {
        success: true,
        message: 'SMS envoyé avec succès',
        smsId: response.data.data[0].smslog_id
      };
    } else if (response.data && response.data.status === 'OK') {
      // Format alternatif possible
      return {
        success: true,
        message: 'SMS envoyé avec succès'
      };
    } else {
      // Construire un message d'erreur détaillé
      let errorMsg = 'Échec de l\'envoi du SMS';
      if (response.data) {
        if (Array.isArray(response.data.data) && response.data.data.length > 0) {
          errorMsg += ': ' + (response.data.data[0].error_string || response.data.data[0].error || 'Erreur inconnue');
        } else if (response.data.error_string) {
          errorMsg += ': ' + response.data.error_string;
        } else if (response.data.error) {
          errorMsg += ': Code ' + response.data.error;
        }
      }
      
      return {
        success: false,
        error: errorMsg
      };
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi du SMS:', error);
    return {
      success: false,
      error: 'Erreur lors de l\'envoi du SMS: ' + error.message
    };
  }
}

// Page d'achat de tickets
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../purchase.html'));
});

// Page "Mes tickets"
router.get('/my-tickets', (req, res) => {
  res.sendFile(path.join(__dirname, '../my-tickets-fixed-final.html'));
});

// Page de confirmation et d'affichage du ticket
router.get('/confirmation/:reservationId', (req, res) => {
  res.sendFile(path.join(__dirname, '../ticket-confirmation-fixed-final.html'));
});

// API pour récupérer les événements disponibles
router.get('/api/events', (req, res) => {
  try {
    // Vérifier si la table events existe
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
    if (!tableCheck) {
      console.log('Table events inexistante');
      return res.json([]);
    }
    
    // Vérifier la structure de la table events
    const columns = db.prepare('PRAGMA table_info(events)').all();
    const columnNames = columns.map(col => col.name);
    console.log('Colonnes de la table events:', columnNames);
    
    // Construire la requête en fonction des colonnes disponibles
    let query = 'SELECT * FROM events';
    
    // Ajouter le filtre active si la colonne existe
    if (columnNames.includes('active')) {
      query += ' WHERE active = 1';
    }
    
    // Ajouter l'ordre si la colonne date existe
    if (columnNames.includes('date')) {
      query += ' ORDER BY date';
    }
    
    console.log('Requête SQL:', query);
    const events = db.prepare(query).all();
    console.log(`Nombre d'événements trouvés: ${events.length}`);
    
    // Si aucun événement n'est trouvé, créer un événement exemple
    if (events.length === 0) {
      console.log('Aucun événement trouvé, création d\'un exemple...');
      
      // Vérifier si toutes les colonnes nécessaires existent
      const requiredColumns = ['name', 'date', 'description', 'categories'];
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
      
      // Ajouter les colonnes manquantes si nécessaire
      if (missingColumns.length > 0) {
        console.log('Ajout des colonnes manquantes:', missingColumns);
        missingColumns.forEach(column => {
          try {
            db.prepare(`ALTER TABLE events ADD COLUMN ${column} TEXT`).run();
            console.log(`Colonne ${column} ajoutée`);
          } catch (err) {
            console.error(`Erreur lors de l'ajout de la colonne ${column}:`, err);
          }
        });
      }
      
      // Ajouter la colonne active si elle n'existe pas
      if (!columnNames.includes('active')) {
        try {
          db.prepare('ALTER TABLE events ADD COLUMN active INTEGER DEFAULT 1').run();
          console.log('Colonne active ajoutée');
        } catch (err) {
          console.error('Erreur lors de l\'ajout de la colonne active:', err);
        }
      }
      
      // Ajouter la colonne available_seats (places disponibles) si elle n'existe pas
      if (!columnNames.includes('available_seats')) {
        try {
          db.prepare('ALTER TABLE events ADD COLUMN available_seats INTEGER DEFAULT 100').run();
          console.log('Colonne available_seats ajoutée avec une valeur par défaut de 100');
        } catch (err) {
          console.error('Erreur lors de l\'ajout de la colonne available_seats:', err);
        }
      }
      
      // Créer un événement exemple
      const categories = JSON.stringify([
        { name: "VIP", price: 10000 },
        { name: "Standard", price: 5000 },
        { name: "Économique", price: 2000 }
      ]);
      
      try {
        db.prepare(`
          INSERT INTO events (name, date, description, categories, active)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          'Concert Exemple', 
          '2025-05-15', 
          'Un événement exemple pour tester l\'application', 
          categories,
          1
        );
        console.log('Événement exemple créé avec succès');
        
        // Récupérer l'événement créé
        const newEvents = db.prepare('SELECT * FROM events').all();
        console.log('Nouveaux événements:', newEvents.length);
        events.push(...newEvents);
      } catch (err) {
        console.error('Erreur lors de la création de l\'événement exemple:', err);
      }
    }
    
    // Formater les événements pour l'affichage
    const formattedEvents = events.map(event => {
      // S'assurer que les catégories sont bien un tableau
      let categories = event.categories;
      if (typeof categories === 'string') {
        try {
          categories = JSON.parse(categories);
        } catch (e) {
          console.error('Erreur de parsing event.categories:', event.categories, e);
          // Fournir des catégories par défaut si le parsing échoue
          categories = [
            { name: "Standard", price: 5000 }
          ];
        }
      } else if (!categories || !Array.isArray(categories)) {
        // Fournir des catégories par défaut si elles sont manquantes
        categories = [
          { name: "Standard", price: 5000 }
        ];
      }
      
      // Standardiser les prix dans les catégories (convertir en nombre)
      categories = categories.map(cat => {
        let price = 0;
        if (typeof cat.price === 'number') {
          price = cat.price;
        } else if (typeof cat.prix === 'number') {
          price = cat.prix;
        } else if (!isNaN(parseFloat(cat.price))) {
          price = parseFloat(cat.price);
        } else if (!isNaN(parseFloat(cat.prix))) {
          price = parseFloat(cat.prix);
        }
        return {
          ...cat,
          price: price // Toujours utiliser 'price' comme clé standard
        };
      });
      
      return {
        id: event.id,
        name: event.name || 'Événement sans nom',
        date: event.date || '2025-05-15',
        description: event.description || 'Pas de description disponible',
        categories: categories
      };
    });
    
    console.log('Événements formatés:', formattedEvents.length);
    res.json(formattedEvents);
  } catch (e) {
    console.error('Erreur lors de la récupération des événements:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements', details: e.message });
  }
});

// Demande de code de vérification SMS
router.post('/api/request-verification', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }
    
    // Générer un code à 6 chiffres
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Vérifier si la table sms_verification existe
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sms_verification'").get();
    
    if (!tableCheck) {
      // Créer la table si elle n'existe pas
      db.prepare(`
        CREATE TABLE sms_verification (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT,
          code TEXT,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      console.log('Table sms_verification créée avec succès');
    }
    
    // Supprimer les anciens codes pour ce numéro
    db.prepare('DELETE FROM sms_verification WHERE phone = ?').run(phone);
    
    // Stocker le nouveau code avec une expiration de 15 minutes
    db.prepare(`
      INSERT INTO sms_verification (phone, code, expires_at)
      VALUES (?, ?, datetime('now', '+15 minutes'))
    `).run(phone, verificationCode);
    
    // Message à envoyer par SMS
    const message = `Votre code de vérification pour Souli-Souli Tickets est : ${verificationCode}`;
    
    // Envoyer le SMS via l'API
    const smsResult = await sendSMS(phone, message);
    
    if (smsResult.success) {
      // Pour les tests, retourner le code (à supprimer en production)
      res.json({ 
        success: true, 
        message: 'Code de vérification envoyé par SMS', 
        code: process.env.NODE_ENV === 'development' ? verificationCode : undefined // Retirer en production
      });
    } else {
      res.status(500).json({ error: smsResult.error || 'Échec de l\'envoi du SMS' });
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi du code de vérification:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du code de vérification' });
  }
});

// Vérification du code SMS et création de session
router.post('/api/verify-code', (req, res) => {
  try {
    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ error: 'Numéro de téléphone et code requis' });
    }
    
    // Vérifier le code
    const verification = db.prepare(`
      SELECT * FROM sms_verification 
      WHERE phone = ? AND code = ? AND expires_at > datetime('now')
    `).get(phone, code);
    
    if (!verification) {
      return res.status(400).json({ error: 'Code invalide ou expiré' });
    }
    
    // Supprimer le code utilisé
    db.prepare('DELETE FROM sms_verification WHERE id = ?').run(verification.id);
    
    // Générer un token de session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Supprimer les anciennes sessions pour ce numéro
    db.prepare('DELETE FROM user_sessions WHERE phone = ?').run(phone);
    
    // Créer une nouvelle session (valide 30 jours)
    db.prepare(`
      INSERT INTO user_sessions (phone, session_token, expires_at)
      VALUES (?, ?, datetime('now', '+30 days'))
    `).run(phone, sessionToken);
    
    // Retourner le token de session
    res.json({ 
      success: true, 
      sessionToken,
      phone,
      message: 'Authentification réussie'
    });
    
  } catch (error) {
    console.error('Erreur lors de la vérification du code:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification du code' });
  }
});

// Vérification de session
router.post('/api/check-session', (req, res) => {
  try {
    const { sessionToken } = req.body;
    
    if (!sessionToken) {
      return res.status(400).json({ error: 'Token de session requis' });
    }
    
    // Vérifier si la session existe et est valide
    const session = db.prepare(`
      SELECT * FROM user_sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).get(sessionToken);
    
    if (!session) {
      return res.status(401).json({ error: 'Session invalide ou expirée' });
    }
    
    // Session valide, retourner les infos utilisateur
    res.json({
      success: true,
      phone: session.phone,
      message: 'Session valide'
    });
    
  } catch (error) {
    console.error('Erreur lors de la vérification de session:', error);
    res.status(500).json({ error: 'Erreur lors de la vérification de session' });
  }
});

// API pour acheter un ticket
router.post('/api/purchase', async (req, res) => {
  try {
    const { eventId, categoryName, fullName, email, phone, quantity, sessionToken } = req.body;
    
    if (!eventId || !categoryName || !fullName || !quantity) {
      return res.status(400).json({ error: 'Informations manquantes pour l\'achat du ticket' });
    }
    
    // Vérifier l'authentification si un token est fourni
    let userPhone = phone;
    
    if (sessionToken) {
      const session = db.prepare(`
        SELECT * FROM user_sessions 
        WHERE session_token = ? AND expires_at > datetime('now')
      `).get(sessionToken);
      
      if (!session) {
        return res.status(401).json({ error: 'Session invalide ou expirée' });
      }
      
      userPhone = session.phone;
    } else if (!phone) {
      return res.status(400).json({ error: 'Numéro de téléphone requis' });
    }
    
    // Récupérer les informations de l'événement
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Événement non trouvé' });
    }
    
    // Vérifier que la catégorie existe
    let categories = event.categories;
    if (typeof categories === 'string') {
      try {
        categories = JSON.parse(categories);
      } catch (e) {
        console.error('Erreur de parsing event.categories:', event.categories, e);
        categories = [];
      }
    }
    
    const category = Array.isArray(categories) ? categories.find(c => c.name === categoryName) : null;
    if (!category) {
      console.error('Catégorie non trouvée ou mal formatée:', categoryName, categories);
      return res.status(404).json({ error: 'Catégorie non trouvée' });
    }
    
    // Calculer le prix total
    let unitPrice = 0;
    if (typeof category.price === 'number') {
      unitPrice = category.price;
    } else if (typeof category.prix === 'number') {
      unitPrice = category.prix;
    } else if (!isNaN(parseFloat(category.price))) {
      unitPrice = parseFloat(category.price);
    } else if (!isNaN(parseFloat(category.prix))) {
      unitPrice = parseFloat(category.prix);
    } else {
      console.error('Aucun prix valide trouvé pour la catégorie:', category);
      unitPrice = 0;
    }
    const totalPrice = unitPrice * quantity;
    console.log('DEBUG Achat - unitPrice:', unitPrice, 'totalPrice:', totalPrice, 'cat:', category);

    
    // Vérifier si la table reservations existe
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    
    if (!tableCheck) {
      // Créer la table reservations si elle n'existe pas
      console.log('Création de la table reservations...');
      db.prepare(`
        CREATE TABLE reservations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user TEXT,
          phone TEXT,
          event_id INTEGER,
          event_name TEXT,
          category_name TEXT,
          quantity INTEGER DEFAULT 1,
          unit_price REAL DEFAULT 0,
          total_price REAL DEFAULT 0,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          email TEXT,
          purchase_channel TEXT,
          formatted_id TEXT,
          qr_code TEXT,
          code TEXT
        )
      `).run();
      console.log('Table reservations créée avec succès');
    } else {
      // Vérifier les colonnes existantes dans la table reservations
      console.log('Vérification des colonnes de la table reservations...');
      const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
      const columns = columnInfo.map(col => col.name);
      console.log('Colonnes existantes:', columns);
      
      // Ajouter les colonnes manquantes nécessaires pour l'achat web
      const requiredColumns = [
        { name: 'email', type: 'TEXT' },
        { name: 'purchase_channel', type: 'TEXT' },
        { name: 'formatted_id', type: 'TEXT' },
        { name: 'qr_code', type: 'TEXT' },
        { name: 'code', type: 'TEXT' },
        { name: 'quantity', type: 'INTEGER DEFAULT 1' },
        { name: 'unit_price', type: 'REAL DEFAULT 0' },
        { name: 'total_price', type: 'REAL DEFAULT 0' }
      ];
      
      for (const col of requiredColumns) {
        if (!columns.includes(col.name)) {
          console.log(`Ajout de la colonne ${col.name}...`);
          try {
            db.prepare(`ALTER TABLE reservations ADD COLUMN ${col.name} ${col.type}`).run();
            console.log(`Colonne ${col.name} ajoutée avec succès`);
          } catch (err) {
            console.error(`Erreur lors de l'ajout de la colonne ${col.name}:`, err);
          }
        }
      }
    }
    
    // Vérifier si la colonne available_seats existe dans la table events
    const eventsColumns = db.prepare('PRAGMA table_info(events)').all();
    const eventsColumnNames = eventsColumns.map(col => col.name);
    console.log('Colonnes de la table events:', eventsColumnNames);
    
    // Ajouter la colonne available_seats si elle n'existe pas
    if (!eventsColumnNames.includes('available_seats')) {
      try {
        console.log('Ajout de la colonne available_seats à la table events...');
        db.prepare('ALTER TABLE events ADD COLUMN available_seats INTEGER DEFAULT 100').run();
        console.log('Colonne available_seats ajoutée avec succès');
      } catch (err) {
        console.error('Erreur lors de l\'ajout de la colonne available_seats:', err);
      }
    }
    
    // Vérifier la disponibilité des places pour l'événement
    const eventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(event.id);
    
    // Si la colonne available_seats existe et contient une valeur
    if (eventInfo && typeof eventInfo.available_seats === 'number') {
      // Vérifier s'il y a assez de places disponibles
      if (eventInfo.available_seats < quantity) {
        return res.status(400).json({
          success: false,
          error: `Désolé, il ne reste que ${eventInfo.available_seats} place(s) disponible(s) pour cet événement.`
        });
      }
    } else {
      // Si la colonne available_seats n'existe pas ou est NULL, initialiser avec une valeur par défaut
      console.log('Initialisation du nombre de places disponibles pour l\'événement...');
      db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(100, event.id);
      console.log('Nombre de places disponibles initialisé à 100');
    }
    
    // Insérer la réservation dans la base de données
    console.log('Insertion de la réservation...');
    
    // Vérifier à nouveau les colonnes pour construire la requête dynamiquement
    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
    const columns = columnInfo.map(col => col.name);
    
    // Construire la requête d'insertion en fonction des colonnes disponibles
    const insertColumns = ['user', 'phone', 'event_id', 'event_name', 'category_name', 'date'];
    const insertValues = [fullName, userPhone || '', event.id, event.name, categoryName, 'datetime(\'now\')'];
    
    // Ajouter les colonnes optionnelles si elles existent
    if (columns.includes('quantity')) {
      insertColumns.push('quantity');
      insertValues.push(quantity);
    }
    
    if (columns.includes('unit_price')) {
      insertColumns.push('unit_price');
      insertValues.push(unitPrice);
    } else {
      insertColumns.push('unit_price');
      insertValues.push(unitPrice);
    }
    
    if (columns.includes('total_price')) {
      insertColumns.push('total_price');
      insertValues.push(totalPrice);
    } else {
      insertColumns.push('total_price');
      insertValues.push(totalPrice);
    }
    
    if (columns.includes('email')) {
      insertColumns.push('email');
      insertValues.push(email || '');
    }
    
    if (columns.includes('purchase_channel')) {
      insertColumns.push('purchase_channel');
      insertValues.push('web');
    }
    
    // Construire la requête SQL
    const placeholders = insertValues.map(value => {
      return value === 'datetime(\'now\')' ? 'datetime(\'now\')' : '?';
    }).join(', ');
    
    const insertSQL = `
      INSERT INTO reservations 
      (${insertColumns.join(', ')}) 
      VALUES (${placeholders})
    `;
    
    console.log('Requête SQL:', insertSQL);
    
    // Filtrer les valeurs pour ne garder que celles qui correspondent aux placeholders '?'
    const filteredValues = insertValues.filter(v => v !== 'datetime(\'now\')');
    console.log('Valeurs filtrées:', filteredValues);
    
    const insertStmt = db.prepare(insertSQL);
    const reservationInfo = insertStmt.run(...filteredValues);
    
    console.log('Réservation insérée avec ID:', reservationInfo.lastInsertRowid);
    
    // Mettre à jour le nombre de places disponibles pour l'événement
    try {
      // Récupérer à nouveau les informations de l'événement pour s'assurer d'avoir les données les plus récentes
      const updatedEventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(event.id);
      
      if (updatedEventInfo && typeof updatedEventInfo.available_seats === 'number') {
        const newAvailableSeats = Math.max(0, updatedEventInfo.available_seats - quantity);
        db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(newAvailableSeats, event.id);
        console.log(`Places disponibles mises à jour: ${updatedEventInfo.available_seats} -> ${newAvailableSeats}`);
      } else {
        // Si la colonne available_seats n'a pas de valeur, initialiser avec une valeur par défaut moins la quantité achetée
        const defaultSeats = 100;
        const newAvailableSeats = Math.max(0, defaultSeats - quantity);
        db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(newAvailableSeats, event.id);
        console.log(`Places disponibles initialisées et mises à jour: ${defaultSeats} -> ${newAvailableSeats}`);
      }
    } catch (updateError) {
      console.error('Erreur lors de la mise à jour des places disponibles:', updateError);
      // Ne pas bloquer le processus d'achat si la mise à jour des places échoue
    }
    
    // Générer les tickets en fonction de la quantité réservée
    const tickets = [];
    
    // Trouver l'index de la catégorie
    const catIdx = Array.isArray(categories) ? categories.findIndex(c => c.name === categoryName) : -1;
    
    // Générer les tickets pour chaque place réservée
    for (let i = 0; i < quantity; i++) {
      // Générer un code QR unique de 7 chiffres pour chaque ticket
      let qrCode;
      do {
        qrCode = String(Math.floor(1000000 + Math.random() * 9000000));
      } while (db.prepare('SELECT 1 FROM reservations WHERE qr_code = ?').get(qrCode));
      
      // Générer l'ID formaté avec un suffixe pour chaque ticket
      const ticketFormattedId = formatReservationId(event.id, catIdx, reservationInfo.lastInsertRowid) + 
                               (quantity > 1 ? `-${i+1}` : '');
      
      // Si c'est le premier ticket, mettre à jour la réservation principale
      if (i === 0) {
        let updateSQL = 'UPDATE reservations SET ';
        const updateValues = [];
        
        if (columns.includes('formatted_id')) {
          updateSQL += 'formatted_id=?, ';
          updateValues.push(ticketFormattedId);
        }
        
        if (columns.includes('qr_code')) {
          updateSQL += 'qr_code=?, ';
          updateValues.push(qrCode);
        }
        
        if (columns.includes('code')) {
          updateSQL += 'code=?, ';
          updateValues.push(ticketFormattedId);
        }
        
        // Supprimer la virgule finale et ajouter la condition WHERE
        updateSQL = updateSQL.replace(/,\s*$/, '') + ' WHERE id=?';
        updateValues.push(reservationInfo.lastInsertRowid);
        
        console.log('Mise à jour SQL:', updateSQL);
        console.log('Valeurs de mise à jour:', updateValues);
        
        if (updateValues.length > 1) { // S'assurer qu'il y a au moins une colonne à mettre à jour
          db.prepare(updateSQL).run(...updateValues);
          console.log('Réservation principale mise à jour avec les codes');
        }
      }
      // Pour les tickets supplémentaires (à partir du 2ème), créer des entrées distinctes liées à la réservation principale
      else {
        // Créer une entrée dans la table des tickets supplémentaires ou dans une table dédiée
        // Vérifier si la table additional_tickets existe
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
        
        if (!tableExists) {
          // Créer la table si elle n'existe pas
          db.prepare(`
            CREATE TABLE additional_tickets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reservation_id INTEGER,
              formatted_id TEXT,
              qr_code TEXT,
              ticket_number INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (reservation_id) REFERENCES reservations(id)
            )
          `).run();
          console.log('Table additional_tickets créée');
        }
        
        // Insérer le ticket supplémentaire
        db.prepare(`
          INSERT INTO additional_tickets (reservation_id, formatted_id, qr_code, ticket_number)
          VALUES (?, ?, ?, ?)
        `).run(reservationInfo.lastInsertRowid, ticketFormattedId, qrCode, i+1);
        console.log(`Ticket supplémentaire #${i+1} créé avec ID: ${ticketFormattedId}`);
      }
      
      // Ajouter le ticket à la liste des tickets générés
      tickets.push({
        id: i === 0 ? reservationInfo.lastInsertRowid : `${reservationInfo.lastInsertRowid}-${i+1}`,
        formattedId: ticketFormattedId,
        qrCode,
        eventName: event.name,
        categoryName,
        price: unitPrice,
        ticketNumber: i+1,
        totalTickets: quantity
      });
    }
    
    // Retourner les informations des tickets
    res.json({ 
      success: true, 
      message: 'Achat réussi !', 
      tickets,
      reservationId: reservationInfo.lastInsertRowid,
      quantity
    });
    
  } catch (e) {
    console.error('Erreur lors de l\'achat du ticket:', e);
    res.status(500).json({ error: 'Erreur lors de l\'achat du ticket', details: e.message });
  }
});

// API pour récupérer les détails d'une réservation
router.get('/api/reservation/:reservationId', (req, res) => {
  try {
    const { reservationId } = req.params;
    console.log('Récupération des détails pour la réservation ID:', reservationId);
    
    // Vérifier si la table reservations existe
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    if (!tableCheck) {
      console.log('Table reservations inexistante');
      return res.status(404).json({ error: 'Table des réservations non disponible' });
    }
    
    // Récupérer les informations de la réservation
    const reservation = db.prepare(`
      SELECT r.*, e.name as event_name, e.date as event_date
      FROM reservations r
      LEFT JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(reservationId);
    
    console.log('Résultat de la requête:', reservation ? 'Réservation trouvée' : 'Réservation non trouvée');
    
    if (!reservation) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    
    // Standardiser le prix pour s'assurer qu'il est toujours disponible comme nombre
    let price = 0;
    if (typeof reservation.unit_price === 'number') {
      price = reservation.unit_price;
    } else if (typeof reservation.price === 'number') {
      price = reservation.price;
    } else if (typeof reservation.total_price === 'number' && (reservation.quantity || 1) > 0) {
      price = Math.round(reservation.total_price / (reservation.quantity || 1));
    } else if (!isNaN(parseFloat(reservation.unit_price))) {
      price = parseFloat(reservation.unit_price);
    } else if (!isNaN(parseFloat(reservation.price))) {
      price = parseFloat(reservation.price);
    } else if (!isNaN(parseFloat(reservation.total_price)) && (reservation.quantity || 1) > 0) {
      price = Math.round(parseFloat(reservation.total_price) / (reservation.quantity || 1));
    }
    
    // Ajouter le prix standardisé à la réponse
    reservation.price = price;
    
    // Renvoyer la réservation dans un format compatible avec le client
    res.json({
      reservation: reservation,
      success: true
    });
  } catch (e) {
    console.error('Erreur lors de la récupération des détails de la réservation:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des détails de la réservation', details: e.message });
  }
});

// API pour récupérer les détails d'un ticket spécifique
router.get('/api/ticket/:ticketId', (req, res) => {
  try {
    const { ticketId } = req.params;
    
    // Récupérer les informations du ticket
    const ticket = db.prepare(`
      SELECT r.*, e.name as event_name, e.date as event_date
      FROM reservations r
      LEFT JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(ticketId);
    
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }
    
    res.json(ticket);
  } catch (e) {
    console.error('Erreur lors de la récupération des détails du ticket:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des détails du ticket', details: e.message });
  }
});

// API pour récupérer les tickets d'un utilisateur
router.get('/api/my-tickets', checkAuth, (req, res) => {
  try {
    const { phone } = req.session;
    console.log('Récupération des tickets pour le numéro:', phone);
    
    // Vérifier si la table des réservations existe
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    if (!tableExists) {
      console.error('La table des réservations n\'existe pas');
      return res.status(500).json({ error: 'Erreur de base de données' });
    }
    
    // Préparer le numéro de téléphone pour la recherche
    const phoneWithoutPrefix = phone.replace(/^\+\d+\s*/, '');
    console.log('Numéro sans préfixe:', phoneWithoutPrefix);
    
    // Récupérer les réservations principales de l'utilisateur
    const reservations = db.prepare(`
      SELECT r.*, e.name as event_name, e.date as event_date
      FROM reservations r
      LEFT JOIN events e ON r.event_id = e.id
      WHERE r.phone = ?
      ORDER BY r.date DESC
    `).all(phone);
    
    console.log(`Réservations trouvées: ${reservations.length}`);
    
    // Si aucune réservation n'est trouvée avec le numéro exact, essayer avec le numéro sans préfixe
    if (reservations.length === 0 && phoneWithoutPrefix !== phone) {
      console.log('Aucune réservation trouvée avec le numéro exact, recherche avec le numéro sans préfixe...');
      
      // Recherche avec LIKE pour trouver des correspondances partielles
      const additionalReservations = db.prepare(`
        SELECT r.*, e.name as event_name, e.date as event_date
        FROM reservations r
        LEFT JOIN events e ON r.event_id = e.id
        WHERE r.phone LIKE ? OR r.phone LIKE ? OR r.phone LIKE ?
        ORDER BY r.date DESC
      `).all(`%${phoneWithoutPrefix}%`, `%${phone}%`, `%${phone.replace('+', '')}%`);
      
      console.log(`Réservations trouvées avec recherche élargie: ${additionalReservations.length}`);
      
      if (additionalReservations.length > 0) {
        // Convertir les réservations en tickets (un ticket par place réservée)
        const tickets = [];
        
        for (const reservation of additionalReservations) {
          // Ajouter le ticket principal
          tickets.push(reservation);
          
          // Vérifier s'il y a des tickets supplémentaires
          if (reservation.quantity > 1) {
            // Vérifier si la table additional_tickets existe
            const additionalTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
            
            if (additionalTableExists) {
              const additionalTickets = db.prepare(`
                SELECT * FROM additional_tickets 
                WHERE reservation_id = ?
                ORDER BY ticket_number
              `).all(reservation.id);
              
              // Ajouter les tickets supplémentaires à la liste
              for (const addTicket of additionalTickets) {
                tickets.push({
                  ...reservation,
                  id: `${reservation.id}-${addTicket.ticket_number}`,
                  formatted_id: addTicket.formatted_id,
                  qr_code: addTicket.qr_code,
                  is_additional: true,
                  ticket_number: addTicket.ticket_number
                });
              }
            }
          }
        }
        
        return res.json({
          success: true,
          tickets: tickets
        });
      }
    }
    
    // Convertir les réservations en tickets (un ticket par place réservée)
    const tickets = [];
    
    for (const reservation of reservations) {
      // Ajouter le ticket principal
      tickets.push(reservation);
      
      // Vérifier s'il y a des tickets supplémentaires
      if (reservation.quantity > 1) {
        // Vérifier si la table additional_tickets existe
        const additionalTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
        
        if (additionalTableExists) {
          const additionalTickets = db.prepare(`
            SELECT * FROM additional_tickets 
            WHERE reservation_id = ?
            ORDER BY ticket_number
          `).all(reservation.id);
          
          // Ajouter les tickets supplémentaires à la liste
          for (const addTicket of additionalTickets) {
            tickets.push({
              ...reservation,
              id: `${reservation.id}-${addTicket.ticket_number}`,
              formatted_id: addTicket.formatted_id,
              qr_code: addTicket.qr_code,
              is_additional: true,
              ticket_number: addTicket.ticket_number
            });
          }
        }
      }
    }
    
    res.json({
      success: true,
      tickets: tickets
    });
    
  } catch (error) {
    console.error('Erreur lors de la récupération des tickets:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des tickets' });
  }
});

// Fonction pour générer un code QR unique de 7 chiffres
function generateUniqueQRCode() {
  // Générer un nombre aléatoire de 7 chiffres
  return Math.floor(1000000 + Math.random() * 9000000).toString();
}

// Route pour générer et télécharger un ticket en image
router.get('/api/generate-ticket-image/:reservationId', async (req, res) => {
  try {
    const { reservationId } = req.params;
    console.log('Génération d\'image de ticket pour la réservation ID:', reservationId);
    
    // Vérifier si c'est un ticket supplémentaire (format reservationId-ticketNumber)
    const isAdditionalTicket = reservationId.includes('-');
    let mainReservationId = reservationId;
    let ticketNumber = 1;
    
    if (isAdditionalTicket) {
      const parts = reservationId.split('-');
      mainReservationId = parts[0];
      ticketNumber = parseInt(parts[1]);
      console.log(`Ticket supplémentaire détecté: Réservation ${mainReservationId}, Ticket #${ticketNumber}`);
    }
    
    // Récupérer les informations de la réservation principale
    const reservation = db.prepare(`
      SELECT r.*, e.name as event_name, e.date as event_date, e.location
      FROM reservations r
      LEFT JOIN events e ON r.event_id = e.id
      WHERE r.id = ?
    `).get(mainReservationId);
    
    if (!reservation) {
      return res.status(404).json({ error: 'Réservation non trouvée' });
    }
    
    // Si c'est un ticket supplémentaire, récupérer ses informations spécifiques
    let qrValue;
    let formattedId;
    
    if (isAdditionalTicket && ticketNumber > 1) {
      // Vérifier si la table additional_tickets existe
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
      
      if (tableExists) {
        const additionalTicket = db.prepare(`
          SELECT * FROM additional_tickets 
          WHERE reservation_id = ? AND ticket_number = ?
        `).get(mainReservationId, ticketNumber);
        
        if (additionalTicket) {
          qrValue = additionalTicket.qr_code;
          formattedId = additionalTicket.formatted_id;
          console.log(`Informations du ticket supplémentaire trouvées: ${formattedId}, QR: ${qrValue}`);
        }
      }
    } else {
      // Utiliser les informations de la réservation principale
      qrValue = reservation.qr_code;
      formattedId = reservation.formatted_id;
    }
    
    // Si aucun code QR n'est trouvé, en générer un nouveau
    if (!qrValue) {
      qrValue = generateUniqueQRCode();
      console.log(`Nouveau code QR généré: ${qrValue}`);
      
      // Sauvegarder le nouveau code QR
      if (isAdditionalTicket && ticketNumber > 1) {
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
        if (tableExists) {
          db.prepare(`
            UPDATE additional_tickets SET qr_code = ? 
            WHERE reservation_id = ? AND ticket_number = ?
          `).run(qrValue, mainReservationId, ticketNumber);
        }
      } else {
        db.prepare('UPDATE reservations SET qr_code = ? WHERE id = ?').run(qrValue, mainReservationId);
      }
    }
    
    // Importer les modules nécessaires pour générer l'image
    const { createCanvas, loadImage, registerFont } = require('canvas');
    const QRCode = require('qrcode');
    const fs = require('fs');
    const path = require('path');
    
    // Enregistrer la police si nécessaire
    try {
      registerFont(path.join(__dirname, '../fonts/OpenSans-Regular.ttf'), { family: 'Open Sans' });
    } catch (err) {
      console.warn('Erreur lors de l\'enregistrement de la police:', err);
    }
    
    // Créer un dossier temporaire pour stocker les images si nécessaire
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Générer le QR code
    const qrBuffer = await QRCode.toBuffer(qrValue, { type: 'png', width: 400 });
    
    // Créer une image ticket verticale (300x400) comme Telegram
    const width = 300, height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fond blanc
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    
    // Charger et dessiner le logo
    const logoPath = path.resolve(__dirname, '../assets', 'kissan-logo.png');
    let logoHeight = 0;
    try {
      const logoImg = await loadImage(logoPath);
      const logoWidth = 110;
      logoHeight = (logoImg.height / logoImg.width) * logoWidth;
      ctx.drawImage(logoImg, (width - logoWidth) / 2, 18, logoWidth, logoHeight);
    } catch (e) {
      console.warn('Logo non trouvé ou erreur de chargement:', e);
      logoHeight = 50;
    }
    
    // Y de base après le logo
    let y = 18 + logoHeight + 16;
    
    // Centrer tous les textes
    ctx.fillStyle = '#000';
    ctx.font = 'bold 22px "Open Sans"';
    ctx.textAlign = 'center';
    ctx.fillText(`${reservation.event_name}`, width / 2, y);
    y += 38;
    ctx.font = '17px "Open Sans"';
    ctx.fillText(`Catégorie : ${reservation.category_name || 'Standard'}`, width / 2, y);
    y += 26;
    ctx.font = '16px "Open Sans"';
    
    // Afficher le prix
    let price = 0;
    if (typeof reservation.unit_price === 'number') {
      price = reservation.unit_price;
    } else if (typeof reservation.price === 'number') {
      price = reservation.price;
    } else if (typeof reservation.total_price === 'number' && (reservation.quantity || 1) > 0) {
      price = Math.round(reservation.total_price / (reservation.quantity || 1));
    }
    
    if (price > 0) {
      ctx.fillText(`Prix : ${price} FCFA`, width / 2, y);
      y += 24;
    }
    
    // Afficher le numéro du ticket si c'est un ticket multiple
    if (reservation.quantity > 1) {
      ctx.fillText(`Ticket ${ticketNumber} sur ${reservation.quantity}`, width / 2, y);
      y += 24;
    }
    
    // Centrer le QR code
    ctx.imageSmoothingEnabled = false; // Désactive le lissage pour la netteté du QR
    const qrImg = await loadImage(qrBuffer);
    const qrSize = 140;
    const topSpace = y;
    const bottomSpace = 48;
    const availableHeight = height - topSpace - bottomSpace;
    const qrY = topSpace + (availableHeight - qrSize) / 2;
    ctx.drawImage(qrImg, (width - qrSize) / 2, qrY, qrSize, qrSize);
    ctx.imageSmoothingEnabled = true;
    
    // Ajout des instructions légales en bas du ticket
    ctx.font = '10px "Open Sans"';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    const legalLines = [
      'Ce ticket est personnel et non transférable.',
      'Veuillez présenter ce ticket à l\'entrée de l\'événement.',
      'Le QR code sera scanné à l\'arrivée pour valider l\'accès.',
      '⚠️ Un seul scan est autorisé par ticket.',
      'Toute reproduction est strictement interdite.'
    ];
    let legalY = height - 48;
    for (const line of legalLines) {
      ctx.fillText(line, width / 2, legalY);
      legalY += 11;
    }
    
    // Envoyer l'image directement
    const ticketBuffer = canvas.toBuffer('image/png');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${reservationId}.png"`);
    return res.send(ticketBuffer);
    
  } catch (error) {
    console.error('Erreur lors de la génération des images de tickets:', error);
    res.status(500).json({ error: 'Erreur lors de la génération des images de tickets', details: error.message });
  }
});

// Exporter le routeur pour l'utiliser dans l'application principale
module.exports = router;
