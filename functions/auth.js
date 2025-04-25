// Simple authentication middleware for Express (sessionless, basic password)
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || 'souli';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kissan@2025';

function requireAuth(req, res, next) {
  if (req.cookies && req.cookies.admin_auth === 'ok') return next();
  res.redirect('/admin/login');
}

function handleLogin(req, res) {
  const { login, password } = req.body;
  if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
    res.cookie('admin_auth', 'ok', { httpOnly: true });
    return res.redirect('/admin');
  }
  res.send('<h2>Identifiants incorrects</h2><a href="/admin/login">Réessayer</a>');
}

function handleLogout(req, res) {
  res.clearCookie('admin_auth');
  res.redirect('/admin/login');
}

module.exports = { requireAuth, handleLogin, handleLogout };
