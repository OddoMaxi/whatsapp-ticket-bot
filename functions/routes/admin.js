const express = require('express');
const path = require('path');
const { requireAuth, handleLogin, handleLogout } = require('../auth');

const router = express.Router();

// Page de connexion admin
router.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/admin/login" style="max-width:400px;margin:60px auto;padding:2em;background:#fff;border-radius:7px;box-shadow:0 2px 10px #0002;">
      <h2>Connexion Admin</h2>
      <input type="text" name="login" placeholder="Login" style="width:100%;padding:8px;margin-bottom:1em;" required />
      <input type="password" name="password" placeholder="Mot de passe" style="width:100%;padding:8px;margin-bottom:1em;" required />
      <button type="submit" style="width:100%;padding:8px;background:#1976d2;color:#fff;border:none;border-radius:3px;">Se connecter</button>
    </form>
  `);
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
