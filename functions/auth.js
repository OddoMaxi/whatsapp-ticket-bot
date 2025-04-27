// Simple authentication middleware for Express (sessionless, basic password)
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'souli';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kissan@2025';

function requireAuth(req, res, next) {
  if (req.cookies && req.cookies.admin_auth === 'ok') return next();
  res.redirect('/admin/login');
}

const fs = require('fs');
const path = require('path');

function handleLogin(req, res) {
  const { login, password } = req.body;
  if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
    res.cookie('admin_auth', 'ok', { httpOnly: true });
    return res.redirect('/admin');
  }
  // Lire le fichier login.html et injecter le message d'erreur dynamiquement
  const loginPath = path.join(__dirname, 'login.html');
  fs.readFile(loginPath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Erreur serveur');
    // Injecte le message d'erreur dans la div prévue
    const htmlWithError = html.replace(
      '<div id="error-message" class="hidden w-full bg-red-100 text-red-700 rounded-md px-3 py-2 text-sm mb-3 text-center"></div>',
      '<div id="error-message" class="w-full bg-red-100 text-red-700 rounded-md px-3 py-2 text-sm mb-3 text-center">Identifiants incorrects<br>Réessayer</div>'
    );
    res.send(htmlWithError);
  });
}

function handleLogout(req, res) {
  res.clearCookie('admin_auth');
  res.redirect('/admin/login');
}

module.exports = { requireAuth, handleLogin, handleLogout };
