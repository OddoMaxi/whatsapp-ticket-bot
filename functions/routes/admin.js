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
    return res.status(500).json({ error: 'Erreur lors de la vérification de la table', details: e.message });
  }
  
  // Si la table n'existe pas, retourner un tableau vide
  if (!tableExists) {
    console.log('La table reservations n\'existe pas encore');
    return res.json([]);
  }
  
  try {
    // Vérifier les colonnes existantes dans la table reservations
    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
    const columns = columnInfo.map(col => col.name);
    console.log('Colonnes existantes dans la table reservations:', columns);
    
    // Construire une requête SQL dynamique basée sur les colonnes existantes
    let selectColumns = ['r.id', 'r.event_id', 'e.name as event_name'];
    
    // Ajouter les colonnes si elles existent
    if (columns.includes('category_name')) selectColumns.push('r.category_name');
    else selectColumns.push("'' as category_name");
    
    if (columns.includes('user')) selectColumns.push('r.user');
    else selectColumns.push("'Utilisateur' as user");
    
    if (columns.includes('phone')) selectColumns.push('r.phone');
    else selectColumns.push("'' as phone");
    
    if (columns.includes('date')) selectColumns.push('r.date');
    else selectColumns.push("CURRENT_TIMESTAMP as date");
    
    // Construire la partie CASE pour le code QR
    let codeCase = "CASE ";
    if (columns.includes('code')) codeCase += "WHEN r.code IS NOT NULL THEN r.code ";
    if (columns.includes('formatted_id')) codeCase += "WHEN r.formatted_id IS NOT NULL THEN r.formatted_id ";
    if (columns.includes('qr_code')) codeCase += "WHEN r.qr_code IS NOT NULL THEN r.qr_code ";
    codeCase += "ELSE 'TICKET-' || r.event_id || '-' || r.id END as code";
    
    selectColumns.push(codeCase);
    
    // Ajouter les colonnes optionnelles pour l'export
    if (columns.includes('formatted_id')) selectColumns.push('r.formatted_id');
    if (columns.includes('qr_code')) selectColumns.push('r.qr_code');
    
    // Construire la requête SQL complète
    let sql = `SELECT ${selectColumns.join(', ')}
    FROM reservations r
    LEFT JOIN events e ON r.event_id = e.id
    WHERE 1=1`;
    
    // Ajouter les filtres si nécessaire
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
  // Récupérer les paramètres de filtrage
  const { event_id, category_name, date } = req.query;
  console.log('Paramètres de filtrage reçus:', { event_id, category_name, date });
  // Vérifier si la table reservations existe
  let tableExists = false;
  try {
    const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
    tableExists = !!tableCheck;
  } catch (e) {
    console.error('Erreur lors de la vérification de la table reservations:', e);
    return res.status(500).json({ error: 'Erreur lors de la vérification de la table', details: e.message });
  }
  
  // Si la table n'existe pas, retourner un tableau vide
  if (!tableExists) {
    console.log('La table reservations n\'existe pas encore');
    return res.json([]);
  }
  
  try {
    // Vérifier les colonnes existantes dans la table reservations
    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
    const columns = columnInfo.map(col => col.name);
    console.log('Colonnes existantes dans la table reservations:', columns);
    
    // Construire une requête SQL dynamique basée sur les colonnes existantes
    let selectColumns = ['r.id', 'r.event_id', 'e.name as event_name'];
    
    // Ajouter les colonnes si elles existent
    if (columns.includes('category_name')) selectColumns.push('r.category_name');
    else selectColumns.push("'' as category_name");
    
    if (columns.includes('quantity')) selectColumns.push('r.quantity');
    else selectColumns.push("1 as quantity");
    
    if (columns.includes('unit_price')) selectColumns.push('r.unit_price');
    else selectColumns.push("0 as unit_price");
    
    if (columns.includes('total_price')) selectColumns.push('r.total_price');
    else selectColumns.push("0 as total_price");
    
    if (columns.includes('user')) selectColumns.push('r.user');
    else selectColumns.push("'Utilisateur' as user");
    
    if (columns.includes('phone')) selectColumns.push('r.phone');
    else selectColumns.push("'' as phone");
    
    if (columns.includes('date')) selectColumns.push('r.date');
    else selectColumns.push("CURRENT_TIMESTAMP as date");
    
    // Construire la partie CASE pour le code QR
    let qrCodeCase = "CASE ";
    if (columns.includes('qr_code')) qrCodeCase += "WHEN r.qr_code IS NOT NULL THEN r.qr_code ";
    if (columns.includes('code')) qrCodeCase += "WHEN r.code IS NOT NULL THEN r.code ";
    if (columns.includes('formatted_id')) qrCodeCase += "WHEN r.formatted_id IS NOT NULL THEN r.formatted_id ";
    qrCodeCase += "ELSE 'TICKET-' || r.event_id || '-' || r.id END as qr_code";
    
    selectColumns.push(qrCodeCase);
    
    // Construire la requête SQL complète avec filtres
    let sql = `SELECT ${selectColumns.join(', ')}
    FROM reservations r
    LEFT JOIN events e ON r.event_id = e.id
    WHERE 1=1`;
    
    // Ajouter les filtres si nécessaire
    const params = [];
    if (event_id) {
      sql += ' AND r.event_id = ?';
      params.push(event_id);
      console.log(`Filtrage par événement: ${event_id}`);
    }
    if (category_name) {
      sql += ' AND r.category_name = ?';
      params.push(category_name);
      console.log(`Filtrage par catégorie: ${category_name}`);
    }
    if (date) {
      sql += " AND DATE(r.date) = DATE(?)";
      params.push(date);
      console.log(`Filtrage par date: ${date}`);
    }
    
    // Ajouter l'ordre de tri
    sql += ' ORDER BY r.date DESC';
    
    console.log('Requête SQL générée:', sql);
    console.log('Paramètres SQL:', params);
    
    // Exécuter la requête avec les paramètres
    const rows = params.length > 0 ? db.prepare(sql).all(...params) : db.prepare(sql).all();
    console.log(`Récupération de ${rows.length} réservations pour l'affichage dans le tableau`);
    
    res.json(rows);
  } catch (e) {
    console.error('Erreur lors de la récupération des réservations:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des réservations', details: e.message });
  }
});

module.exports = router;
