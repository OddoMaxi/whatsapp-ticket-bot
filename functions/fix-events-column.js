// Script de correction pour ajouter la colonne 'active' à la table events si elle manque
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data.sqlite'));

const columns = db.prepare("PRAGMA table_info(events)").all();
const hasActive = columns.some(col => col.name === 'active');

if (!hasActive) {
  db.prepare("ALTER TABLE events ADD COLUMN active INTEGER DEFAULT 1").run();
  console.log("Colonne 'active' ajoutée à la table events.");
} else {
  console.log("La colonne 'active' existe déjà.");
}
