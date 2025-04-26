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

module.exports = router;
