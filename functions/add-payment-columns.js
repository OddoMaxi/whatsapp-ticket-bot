/**
 * Script pour ajouter les colonnes nécessaires au système de paiement
 * à la table reservations existante
 */

const Database = require('better-sqlite3');
const path = require('path');

// Connexion à la base de données
const db = new Database(path.join(__dirname, 'data.sqlite'));

console.log('Démarrage de la migration pour ajouter les colonnes de paiement...');

try {
  // Vérifier si les colonnes existent déjà
  const columns = db.prepare("PRAGMA table_info(reservations)").all();
  const columnsMap = {};
  
  columns.forEach(col => {
    columnsMap[col.name] = true;
  });
  
  // Ajouter la colonne payment_reference si elle n'existe pas
  if (!columnsMap.payment_reference) {
    console.log('Ajout de la colonne payment_reference');
    db.prepare("ALTER TABLE reservations ADD COLUMN payment_reference TEXT").run();
  } else {
    console.log('La colonne payment_reference existe déjà');
  }
  
  // Ajouter la colonne payment_status si elle n'existe pas
  if (!columnsMap.payment_status) {
    console.log('Ajout de la colonne payment_status');
    db.prepare("ALTER TABLE reservations ADD COLUMN payment_status TEXT").run();
  } else {
    console.log('La colonne payment_status existe déjà');
  }
  
  console.log('Migration terminée avec succès!');
} catch (error) {
  console.error('Erreur lors de la migration:', error);
} finally {
  db.close();
}
