// Script pour mettre à jour les codes manquants dans les réservations
const Database = require('better-sqlite3');
const path = require('path');

// Connexion à la base de données
const db = new Database(path.join(__dirname, 'data.sqlite'));

try {
  // Mettre à jour les réservations qui ont un formatted_id mais pas de code
  const result = db.prepare('UPDATE reservations SET code = formatted_id WHERE code IS NULL AND formatted_id IS NOT NULL').run();
  console.log(`${result.changes} réservations mises à jour avec leur code.`);
  
  // Vérifier les réservations sans code ni formatted_id
  const missingBoth = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE code IS NULL AND formatted_id IS NULL').get();
  if (missingBoth.count > 0) {
    console.log(`Attention: ${missingBoth.count} réservations n'ont ni code ni formatted_id.`);
  }
  
  // Afficher quelques exemples de réservations mises à jour
  const examples = db.prepare('SELECT id, code, formatted_id FROM reservations WHERE code IS NOT NULL LIMIT 5').all();
  if (examples.length > 0) {
    console.log('\nExemples de réservations avec code:');
    examples.forEach(ex => {
      console.log(`ID: ${ex.id}, Code: ${ex.code}, FormattedID: ${ex.formatted_id}`);
    });
  }
} catch (error) {
  console.error('Erreur lors de la mise à jour des codes:', error);
} finally {
  // Fermer la connexion à la base de données
  db.close();
}
