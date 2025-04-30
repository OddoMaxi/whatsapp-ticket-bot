const express = require('express');
const path = require('path');
const { requireAuth, handleLogin, handleLogout } = require('../auth');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '../data.sqlite'));

const router = express.Router();

// Page de connexion admin
router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../login.html'));
});

// Soumission du formulaire de connexion
router.post('/login', handleLogin);

// Déconnexion
router.get('/logout', handleLogout);

// Protéger l'accès à l'interface admin
router.use('/', requireAuth);

// Page principale admin
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin.html'));
});

// --- Export tickets/codes QR par événement/catégorie ---

router.get('/tickets', requireAuth, (req, res) => {
  const { event_id, category_name } = req.query;
  
  // Vérifier si la table reservations existe
  let tableExists = false;
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    tableExists = !!tableCheck;
  } catch (e) {
    console.error('Erreur lors de la vérification de la table reservations:', e);
  }
  
  // Si la table n'existe pas, retourner un tableau vide
  if (!tableExists) {
    console.log('La table reservations n\'existe pas encore');
    return res.json([]);
  }
  
  // Vérifier si la colonne 'code' existe dans la table reservations
  let codeColumnExists = false;
  try {
    const tableInfo = db.prepare("PRAGMA table_info(reservations)").all();
    codeColumnExists = tableInfo.some(col => col.name === 'code');
  } catch (e) {
    console.error('Erreur lors de la vérification de la colonne code:', e);
  }
  
  // Construire la requête SQL pour récupérer tous les champs nécessaires
  // Utiliser une requête qui fonctionne même si certaines colonnes n'existent pas
  const sql = `SELECT 
    r.id, r.event_id, e.name as event_name, r.category_name, 
    r.status, r.user, r.phone, r.date,
    CASE 
      WHEN r.code IS NOT NULL THEN r.code
      WHEN r.formatted_id IS NOT NULL THEN r.formatted_id 
      WHEN r.qr_code IS NOT NULL THEN r.qr_code
      ELSE 'TICKET-' || r.event_id || '-' || r.id
    END as code,
    r.formatted_id, r.qr_code
  FROM reservations r
  LEFT JOIN events e ON r.event_id = e.id
  WHERE 1=1`;
  
  const params = [];
  if (event_id) {
    sql += ' AND r.event_id = ?';
    params.push(event_id);
  }
  if (category_name) {
    sql += ' AND r.category_name = ?';
    params.push(category_name);
  }
  sql += ' ORDER BY r.date DESC';
  
  // Ajout des logs pour debug
  console.log('--- [EXPORT QR CSV] ---');
  console.log('event_id:', event_id);
  console.log('category_name:', category_name);
  console.log('SQL:', sql);
  console.log('Params:', params);
  
  try {
    const rows = db.prepare(sql).all(...params);
    console.log('Nombre de tickets trouvés:', rows.length);
    
    // Ajouter des logs pour déboguer les valeurs des champs
    if (rows.length > 0) {
      console.log('Exemple de ticket:');
      console.log('- ID:', rows[0].id);
      console.log('- Code:', rows[0].code);
      console.log('- FormattedID:', rows[0].formatted_id);
      console.log('- QR Code:', rows[0].qr_code);
    }
    
    // Post-traitement pour garantir que le champ code est toujours rempli
    const processedRows = rows.map(row => {
      // Garantir que le code est toujours présent et non vide
      if (!row.code || row.code === 'null' || row.code === 'undefined') {
        // Utiliser qr_code comme premier choix car c'est le code numérique généré pour le QR
        row.code = row.qr_code || row.formatted_id || `TICKET-${row.event_id}-${row.id}`;
      }
      return row;
    });
    
    res.json(processedRows);
  } catch (e) {
    console.error('Erreur lors de la récupération des tickets:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des tickets', details: e.message });
  }
});

// Route pour récupérer les événements et leurs catégories pour le tableau de bord
router.get('/dashboard', requireAuth, (req, res) => {
  try {
    // Vérifier si la table events existe
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
    if (!tableExists) {
      console.log('La table events n\'existe pas encore');
      return res.json([]);
    }
    
    // Récupérer tous les événements avec leurs catégories
    const events = db.prepare('SELECT * FROM events').all();
    
    // Convertir les catégories de JSON à objet JavaScript
    const processedEvents = events.map(ev => {
      try {
        if (ev.categories && typeof ev.categories === 'string') {
          ev.categories = JSON.parse(ev.categories);
        }
      } catch (e) {
        console.error(`Erreur lors du parsing des catégories pour l'événement ${ev.id}:`, e);
        ev.categories = [];
      }
      return ev;
    });
    
    console.log(`Récupération de ${processedEvents.length} événements pour le tableau de bord`);
    res.json(processedEvents);
  } catch (e) {
    console.error('Erreur lors de la récupération des événements:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des événements', details: e.message });
  }
});

// Route pour récupérer les réservations pour l'affichage dans le tableau
router.get('/reservations', requireAuth, (req, res) => {
  // Vérifier si la table reservations existe
  let tableExists = false;
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    tableExists = !!tableCheck;
  } catch (e) {
    console.error('Erreur lors de la vérification de la table reservations:', e);
  }
  
  // Si la table n'existe pas, retourner un tableau vide
  if (!tableExists) {
    console.log('La table reservations n\'existe pas encore');
    return res.json([]);
  }
  
  try {
    // Construire une requête SQL robuste qui fonctionne même si certaines colonnes n'existent pas
    const sql = `SELECT 
      r.id, r.event_id, e.name as event_name, r.category_name, 
      r.quantity, r.unit_price, r.total_price, r.status, r.user, r.phone, r.date,
      CASE 
        WHEN r.qr_code IS NOT NULL THEN r.qr_code
        WHEN r.code IS NOT NULL THEN r.code
        WHEN r.formatted_id IS NOT NULL THEN r.formatted_id
        ELSE 'TICKET-' || r.event_id || '-' || r.id
      END as qr_code
    FROM reservations r
    LEFT JOIN events e ON r.event_id = e.id
    ORDER BY r.date DESC`;
    
    const rows = db.prepare(sql).all();
    console.log(`Récupération de ${rows.length} réservations pour l'affichage dans le tableau`);
    
    res.json(rows);
  } catch (e) {
    console.error('Erreur lors de la récupération des réservations:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations', details: e.message });
  }
});

module.exports = router;
