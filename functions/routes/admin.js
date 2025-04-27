const express = require('express');
const path = require('path');
const { requireAuth, handleLogin, handleLogout } = require('../auth');

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
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data.sqlite'));

router.get('/tickets', requireAuth, (req, res) => {
  const { event_id, category_name } = req.query;
  let sql = `SELECT r.event_id, e.name as event_name, r.category_name, r.code, r.status, r.user, r.phone, r.date
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
    res.json(rows);
  } catch (e) {
    console.error('Erreur lors de la récupération des tickets:', e);
    res.status(500).json({ error: 'Erreur lors de la récupération des tickets', details: e.message });
  }
});

module.exports = router;
