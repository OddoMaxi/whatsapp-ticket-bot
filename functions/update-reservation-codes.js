// Script pour mettre à jour le champ 'code' des réservations existantes
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Chemin vers la base de données
const dbPath = path.join(__dirname, 'data.sqlite');

// Vérifier si le fichier de base de données existe
if (!fs.existsSync(dbPath)) {
  console.log(`La base de données n'existe pas encore à l'emplacement: ${dbPath}`);
  process.exit(0);
}

// Connexion à la base de données
const db = new Database(dbPath);

try {
  // Vérifier si la table reservations existe
  const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reservations'").get();
  
  if (!tableExists) {
    console.log("La table 'reservations' n'existe pas encore.");
    process.exit(0);
  }
  
  // Vérifier si les colonnes nécessaires existent
  const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
  const columns = columnInfo.map(col => col.name);
  
  console.log("Colonnes existantes dans la table 'reservations':", columns.join(', '));
  
  const codeColumnExists = columns.includes('code');
  const formattedIdColumnExists = columns.includes('formatted_id');
  
  if (!codeColumnExists) {
    console.log("Ajout de la colonne 'code' à la table 'reservations'...");
    db.prepare("ALTER TABLE reservations ADD COLUMN code TEXT").run();
    console.log("Colonne 'code' ajoutée avec succès.");
  }
  
  if (!formattedIdColumnExists) {
    console.log("La colonne 'formatted_id' n'existe pas. Impossible de mettre à jour les codes.");
    process.exit(0);
  }
  
  // Mettre à jour le champ 'code' avec la valeur de 'formatted_id' pour les réservations où 'code' est NULL
  const updateResult = db.prepare("UPDATE reservations SET code = formatted_id WHERE code IS NULL AND formatted_id IS NOT NULL").run();
  console.log(`${updateResult.changes} réservations ont été mises à jour avec leur code.`);
  
  // Afficher quelques exemples de réservations mises à jour
  const examples = db.prepare("SELECT id, code, formatted_id FROM reservations WHERE code IS NOT NULL LIMIT 5").all();
  if (examples.length > 0) {
    console.log("\nExemples de réservations avec code:");
    examples.forEach(ex => {
      console.log(`ID: ${ex.id}, Code: ${ex.code}, FormattedID: ${ex.formatted_id}`);
    });
  }
  
  // Vérifier s'il reste des réservations sans code
  const missingCodes = db.prepare("SELECT COUNT(*) as count FROM reservations WHERE code IS NULL").get();
  if (missingCodes.count > 0) {
    console.log(`\nAttention: ${missingCodes.count} réservations n'ont toujours pas de code.`);
  } else {
    console.log("\nToutes les réservations ont maintenant un code.");
  }
  
} catch (error) {
  console.error('Erreur lors de la mise à jour des codes:', error);
} finally {
  // Fermer la connexion à la base de données
  db.close();
}
