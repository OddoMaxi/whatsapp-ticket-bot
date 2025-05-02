/**
 * Script pour configurer les tables nécessaires à la fonctionnalité d'achat web
 * Exécuter avec: node setup-web-purchase.js
 */

const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data.sqlite'));

// Activer le mode WAL pour éviter les corruptions
db.pragma('journal_mode = WAL');

console.log('Configuration des tables pour la fonctionnalité d\'achat web...');

// Table pour les codes de vérification SMS
db.prepare(`
  CREATE TABLE IF NOT EXISTS sms_verification (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();
console.log('✅ Table sms_verification créée ou existante');

// Table pour les sessions utilisateurs
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();
console.log('✅ Table user_sessions créée ou existante');

// Vérifier si la table reservations existe
const reservationsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();

if (reservationsExists) {
  // Vérifier si la colonne purchase_channel existe dans la table reservations
  const columns = db.prepare("PRAGMA table_info(reservations)").all();
  const hasEmailColumn = columns.some(col => col.name === 'email');
  const hasPurchaseChannelColumn = columns.some(col => col.name === 'purchase_channel');
  
  // Ajouter la colonne email si elle n'existe pas
  if (!hasEmailColumn) {
    db.prepare("ALTER TABLE reservations ADD COLUMN email TEXT").run();
    console.log('✅ Colonne email ajoutée à la table reservations');
  } else {
    console.log('✅ Colonne email déjà présente dans la table reservations');
  }
  
  // Ajouter la colonne purchase_channel si elle n'existe pas
  if (!hasPurchaseChannelColumn) {
    db.prepare("ALTER TABLE reservations ADD COLUMN purchase_channel TEXT DEFAULT 'whatsapp'").run();
    console.log('✅ Colonne purchase_channel ajoutée à la table reservations');
  } else {
    console.log('✅ Colonne purchase_channel déjà présente dans la table reservations');
  }
} else {
  console.log('⚠️ La table reservations n\'existe pas encore. Elle sera créée lors de la première réservation.');
}

console.log('✅ Configuration terminée avec succès!');
