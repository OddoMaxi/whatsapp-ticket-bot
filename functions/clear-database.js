// Script pour vider les tables de la base de données
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Chemin vers la base de données
const dbPath = path.join(__dirname, 'data.sqlite');

// Vérifier si la base de données existe
if (!fs.existsSync(dbPath)) {
    console.error('La base de données n\'existe pas à l\'emplacement:', dbPath);
    process.exit(1);
}

// Connecter à la base de données
const db = new Database(dbPath);

try {
    // Récupérer la liste des tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    console.log('Tables trouvées dans la base de données:');
    tables.forEach(table => console.log(`- ${table.name}`));
    
    // Désactiver les contraintes de clés étrangères temporairement pour faciliter la suppression
    db.prepare('PRAGMA foreign_keys = OFF').run();
    
    // Vider chaque table sauf sqlite_sequence
    tables.forEach(table => {
        if (table.name !== 'sqlite_sequence') {
            console.log(`Vidage de la table ${table.name}...`);
            try {
                db.prepare(`DELETE FROM ${table.name}`).run();
                console.log(`✅ Table ${table.name} vidée avec succès`);
            } catch (err) {
                console.error(`❌ Erreur lors du vidage de la table ${table.name}:`, err.message);
            }
        }
    });
    
    // Réactiver les contraintes de clés étrangères
    db.prepare('PRAGMA foreign_keys = ON').run();
    
    console.log('✅ Toutes les tables ont été vidées avec succès');
} catch (err) {
    console.error('❌ Erreur lors du vidage des tables:', err.message);
} finally {
    // Fermer la connexion à la base de données
    db.close();
}
