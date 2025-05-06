// Test de génération de tickets multiples
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Fonction simulée pour générer des QR codes
const chapchapPay = {
    generateQRCode: () => {
        // Génère un code QR aléatoire à 7 chiffres
        return Math.floor(1000000 + Math.random() * 9000000).toString();
    },
    generateTransactionId: () => {
        // Génère un ID de transaction aléatoire
        return uuidv4().slice(0, 8).toUpperCase();
    }
};

// Chemin vers la base de données
const dbPath = path.join(__dirname, 'data.sqlite');

// Vérifier si la base de données existe
if (!fs.existsSync(dbPath)) {
    console.error('La base de données n\'existe pas à l\'emplacement:', dbPath);
    process.exit(1);
}

// Connecter à la base de données
const db = new Database(dbPath);

// Importer des événements de test si nécessaire
function setupTestEvents() {
    try {
        // Vérifier si des événements existent déjà
        const existingEvents = db.prepare('SELECT COUNT(*) as count FROM events').get();
        
        if (existingEvents.count === 0) {
            console.log('Ajout d\'un événement de test...');
            
            // Créer un événement de test
            const eventId = db.prepare(`
                INSERT INTO events (name, date, description, venue, available_seats, image_url)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                'Événement de Test',
                '2023-12-31',
                'Description de l\'événement de test',
                'Lieu de test',
                100,
                'https://example.com/image.jpg'
            ).lastInsertRowid;
            
            console.log(`Événement de test créé avec ID: ${eventId}`);
            
            // Ajouter des catégories de tickets
            const categories = [
                { name: 'VIP', price: 50000, quantity: 20 },
                { name: 'Standard', price: 25000, quantity: 50 },
                { name: 'Économique', price: 10000, quantity: 30 }
            ];
            
            // Mettre à jour l'événement avec les catégories
            db.prepare(`
                UPDATE events 
                SET categories = ?
                WHERE id = ?
            `).run(JSON.stringify(categories), eventId);
            
            console.log('Catégories de tickets ajoutées');
            
            return eventId;
        } else {
            // Récupérer un ID d'événement existant
            const event = db.prepare('SELECT id FROM events LIMIT 1').get();
            console.log(`Utilisation de l'événement existant avec ID: ${event.id}`);
            return event.id;
        }
    } catch (err) {
        console.error('Erreur lors de la configuration des événements de test:', err.message);
        return null;
    }
}

// Fonction pour tester la génération de tickets multiples
function testMultipleTickets(eventId, quantity) {
    try {
        if (!eventId) {
            console.error('ID d\'événement non valide');
            return;
        }
        
        console.log(`Test de génération de ${quantity} tickets pour l'événement ${eventId}`);
        
        // Récupérer les informations de l'événement
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
        if (!event) {
            console.error('Événement non trouvé');
            return;
        }
        
        console.log('Événement trouvé:', event.name);
        
        // Simuler les données de session
        const session = {
            event: {
                id: event.id,
                name: event.name
            },
            category: {
                name: 'Standard',
                price: 25000
            },
            quantity: quantity
        };
        
        // Vérifier les colonnes dans la table reservations
        const columns = db.prepare("PRAGMA table_info(reservations)").all();
        const hasParentReference = columns.some(col => col.name === 'parent_reference');
        const hasTicketNumber = columns.some(col => col.name === 'ticket_number');
        
        // Ajouter les colonnes manquantes si nécessaire
        if (!hasParentReference) {
            console.log('Ajout de la colonne parent_reference à la table reservations');
            db.prepare("ALTER TABLE reservations ADD COLUMN parent_reference TEXT").run();
        }
        
        if (!hasTicketNumber) {
            console.log('Ajout de la colonne ticket_number INTEGER à la table reservations');
            db.prepare("ALTER TABLE reservations ADD COLUMN ticket_number INTEGER").run();
        }
        
        // Générer une référence principale pour la réservation
        const reference = `${Math.floor(1000 + Math.random() * 9000)}-${chapchapPay.generateTransactionId()}`;
        console.log(`Référence principale générée: ${reference}`);
        
        // Obtenir la date actuelle formatée
        const currentDate = new Date().toISOString().split('T')[0];
        
        // Simuler l'insertion du ticket principal
        const mainQRCode = chapchapPay.generateQRCode();
        console.log(`QR code généré pour le ticket principal: ${mainQRCode}`);
        
        let mainInsertSQL = `
            INSERT INTO reservations 
            (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, date
        `;
        
        mainInsertSQL += `, parent_reference, ticket_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const mainResult = db.prepare(mainInsertSQL).run(
            'Test User',
            '123456789',
            session.event.id,
            session.event.name,
            session.category.name,
            1,
            session.category.price,
            session.category.price,
            'test',
            reference,
            mainQRCode,
            currentDate,
            reference,
            1
        );
        
        console.log(`Ticket principal inséré. ID: ${mainResult.lastInsertRowid}`);
        
        // Générer les tickets supplémentaires
        if (quantity > 1) {
            console.log(`Génération de ${quantity - 1} tickets supplémentaires`);
            
            for (let i = 1; i < quantity; i++) {
                try {
                    // Générer un nouveau code QR unique pour chaque ticket supplémentaire
                    const additionalQRCode = chapchapPay.generateQRCode();
                    console.log(`Nouveau QR code généré pour le ticket supplémentaire #${i+1}: ${additionalQRCode}`);
                    
                    // Préparer la requête SQL pour les tickets supplémentaires
                    let additionalInsertSQL = `
                        INSERT INTO reservations 
                        (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, date
                    `;
                    
                    additionalInsertSQL += `, parent_reference, ticket_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                    
                    const additionalResult = db.prepare(additionalInsertSQL).run(
                        'Test User',
                        '123456789',
                        session.event.id,
                        session.event.name,
                        session.category.name,
                        1,
                        session.category.price,
                        session.category.price,
                        'test',
                        `${reference}-${i+1}`,
                        additionalQRCode,
                        currentDate,
                        reference,
                        i+1
                    );
                    
                    console.log(`Ticket supplémentaire #${i+1} inséré. ID: ${additionalResult.lastInsertRowid}`);
                } catch (additionalTicketError) {
                    console.error(`Erreur lors de l'insertion du ticket supplémentaire #${i+1}:`, additionalTicketError);
                }
            }
        }
        
        // Vérifier si tous les tickets ont été créés
        const reservations = db.prepare(`
            SELECT * FROM reservations WHERE parent_reference = ? ORDER BY ticket_number
        `).all(reference);
        
        console.log(`Vérification: ${reservations.length} tickets créés au total pour la référence ${reference}`);
        reservations.forEach((ticket, index) => {
            console.log(`- Ticket #${index+1}: ID=${ticket.id}, Formatted_ID=${ticket.formatted_id}, QR=${ticket.qr_code}`);
        });
        
        console.log('Test terminé avec succès!');
    } catch (err) {
        console.error('Erreur lors du test de génération de tickets:', err);
    }
}

// Exécuter le test
const eventId = setupTestEvents();
testMultipleTickets(eventId, 3); // Tester avec 3 tickets

// Fermer la connexion à la base de données
db.close();
