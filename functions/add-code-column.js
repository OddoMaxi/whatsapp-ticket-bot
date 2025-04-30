// Script pour ajouter la colonne "code" à la table reservations
const Database = require('better-sqlite3');
const path = require('path');

// Connexion à la base de données
const db = new Database(path.join(__dirname, 'data.sqlite'));

try {
  // Vérifier si la table reservations existe
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
  
  if (!tableExists) {
    console.log("La table 'reservations' n'existe pas encore. Elle sera créée lors de la première réservation.");
  } else {
    // Vérifier si la colonne code existe déjà
    const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
    const codeColumnExists = columnInfo.some(col => col.name === 'code');
    
    if (codeColumnExists) {
      console.log("La colonne 'code' existe déjà dans la table 'reservations'.");
    } else {
      // Ajouter la colonne code
      db.prepare("ALTER TABLE reservations ADD COLUMN code TEXT").run();
      console.log("Colonne 'code' ajoutée avec succès à la table 'reservations'.");
    }
  }
  
  // Afficher la structure de la table
  console.log("\nStructure actuelle de la table 'reservations':");
  if (tableExists) {
    const columns = db.prepare("PRAGMA table_info(reservations)").all();
    columns.forEach(col => {
      console.log(`- ${col.name} (${col.type})`);
    });
  }
} catch (error) {
  console.error('Erreur:', error);
} finally {
  // Fermer la connexion à la base de données
  db.close();
}
