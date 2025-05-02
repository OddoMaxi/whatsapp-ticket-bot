/**
 * Script de diagnostic pour vérifier la table des événements
 */

const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'data.sqlite'));

console.log('=== Diagnostic de la table events ===');

// Vérifier si la table events existe
const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get();
console.log('Table events existe:', !!tableCheck);

if (tableCheck) {
  // Afficher la structure de la table
  console.log('\nStructure de la table events:');
  const columns = db.prepare('PRAGMA table_info(events)').all();
  console.table(columns);
  
  // Compter les événements
  const count = db.prepare('SELECT COUNT(*) as count FROM events').get();
  console.log(`\nNombre d'événements: ${count.count}`);
  
  // Vérifier si la colonne 'active' existe
  const hasActiveColumn = columns.some(col => col.name === 'active');
  console.log('Colonne "active" existe:', hasActiveColumn);
  
  // Récupérer les événements
  let query = 'SELECT * FROM events';
  if (hasActiveColumn) {
    query += ' WHERE active = 1';
  }
  query += ' ORDER BY date';
  
  try {
    const events = db.prepare(query).all();
    console.log(`\nÉvénements trouvés: ${events.length}`);
    
    if (events.length > 0) {
      console.log('\nPremier événement:');
      console.log(events[0]);
      
      // Vérifier le format des catégories
      console.log('\nFormat des catégories:');
      console.log('Type:', typeof events[0].categories);
      if (typeof events[0].categories === 'string') {
        try {
          const parsed = JSON.parse(events[0].categories);
          console.log('Parsing JSON réussi:', Array.isArray(parsed));
          console.log('Exemple de catégories parsées:', parsed);
        } catch (e) {
          console.error('Erreur de parsing JSON:', e.message);
          console.log('Valeur brute:', events[0].categories);
        }
      } else {
        console.log('Valeur brute:', events[0].categories);
      }
    }
  } catch (error) {
    console.error('\nErreur lors de la récupération des événements:', error.message);
  }
} else {
  console.log('\nLa table events n\'existe pas. Création d\'un exemple d\'événement...');
  
  // Créer la table events si elle n'existe pas
  try {
    db.prepare(`
      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        date TEXT,
        description TEXT,
        categories TEXT,
        active INTEGER DEFAULT 1
      )
    `).run();
    console.log('Table events créée avec succès');
    
    // Insérer un événement exemple
    const categories = JSON.stringify([
      { name: "VIP", price: 10000 },
      { name: "Standard", price: 5000 },
      { name: "Économique", price: 2000 }
    ]);
    
    db.prepare(`
      INSERT INTO events (name, date, description, categories, active)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'Concert Exemple', 
      '2025-05-15', 
      'Un événement exemple pour tester l\'application', 
      categories,
      1
    );
    
    console.log('Événement exemple créé avec succès');
  } catch (error) {
    console.error('Erreur lors de la création de la table events:', error.message);
  }
}

console.log('\n=== Fin du diagnostic ===');
