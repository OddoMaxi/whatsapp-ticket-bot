// Script pour envoyer tous les tickets d'une réservation
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Récupérer les fonctions nécessaires depuis l'index 
const { generateAndSendTicket } = require('./index');

// Fonction pour envoyer tous les tickets d'une réservation
async function sendAllTickets(referenceId, chatId) {
  console.log(`Envoi de tous les tickets pour la référence: ${referenceId} au chat ID: ${chatId}`);
  
  try {
    // Connecter à la base de données
    const dbPath = path.join(__dirname, 'data.sqlite');
    const db = new Database(dbPath);
    
    // Récupérer tous les tickets associés à cette référence (principal et supplémentaires)
    const tickets = db.prepare(`
      SELECT * FROM reservations 
      WHERE parent_reference = ? OR formatted_id = ? 
      ORDER BY ticket_number ASC
    `).all(referenceId, referenceId);
    
    console.log(`${tickets.length} tickets trouvés pour la référence ${referenceId}`);
    
    if (tickets.length === 0) {
      console.error(`Aucun ticket trouvé pour la référence ${referenceId}`);
      return {
        success: false,
        message: `Aucun ticket trouvé pour la référence ${referenceId}`,
        tickets: []
      };
    }
    
    // Extraire l'information de l'événement et de la catégorie du premier ticket
    const eventName = tickets[0].event_name;
    const category = tickets[0].category_name;
    const price = tickets[0].unit_price;
    
    // Envoyer chaque ticket un par un
    for (const ticket of tickets) {
      console.log(`Envoi du ticket #${ticket.ticket_number || 1} (ID: ${ticket.id}, QR: ${ticket.qr_code})`);
      
      try {
        await generateAndSendTicket({
          to: chatId,
          channel: 'telegram',
          eventName: eventName,
          category: category,
          reservationId: ticket.id,
          price: price,
          formattedId: ticket.formatted_id || ticket.reference,
          qrCode: ticket.qr_code
        });
        
        // Pause courte entre chaque envoi pour éviter les limitations de l'API
        await new Promise(resolve => setTimeout(resolve, 700));
        
        console.log(`Ticket #${ticket.ticket_number || 1} envoyé avec succès`);
      } catch (sendError) {
        console.error(`Erreur lors de l'envoi du ticket #${ticket.ticket_number || 1}:`, sendError);
      }
    }
    
    console.log(`Tous les tickets (${tickets.length}) ont été envoyés pour la référence ${referenceId}`);
    return {
      success: true,
      message: `${tickets.length} tickets envoyés avec succès`,
      tickets: tickets.map(t => ({ id: t.id, qr: t.qr_code }))
    };
  } catch (error) {
    console.error('Erreur lors de l\'envoi des tickets:', error);
    return {
      success: false,
      message: `Erreur: ${error.message}`,
      tickets: []
    };
  }
}

// Fonction pour rechercher et envoyer tous les tickets récemment achetés par un utilisateur
async function sendLatestUserTickets(userId, chatId) {
  console.log(`Recherche des derniers tickets pour l'utilisateur ID: ${userId}`);
  
  try {
    // Connecter à la base de données
    const dbPath = path.join(__dirname, 'data.sqlite');
    const db = new Database(dbPath);
    
    // Récupérer les références de tickets uniques les plus récentes pour cet utilisateur
    const references = db.prepare(`
      SELECT DISTINCT parent_reference, MAX(id) as latest_id
      FROM reservations 
      WHERE phone = ? OR user LIKE ? 
      GROUP BY parent_reference
      ORDER BY latest_id DESC
      LIMIT 5
    `).all(userId, `%${userId}%`);
    
    console.log(`${references.length} groupes de tickets trouvés pour l'utilisateur ${userId}`);
    
    if (references.length === 0) {
      console.error(`Aucun ticket trouvé pour l'utilisateur ${userId}`);
      return {
        success: false,
        message: `Aucun ticket trouvé pour cet utilisateur`,
        tickets: []
      };
    }
    
    // Envoyer tous les tickets pour chaque référence
    let totalTickets = 0;
    for (const ref of references) {
      if (ref.parent_reference) {
        const result = await sendAllTickets(ref.parent_reference, chatId);
        if (result.success) {
          totalTickets += result.tickets.length;
        }
        
        // Pause entre chaque groupe de tickets
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    console.log(`Au total, ${totalTickets} tickets ont été envoyés à l'utilisateur ${userId}`);
    return {
      success: true,
      message: `${totalTickets} tickets envoyés avec succès`,
      totalTickets
    };
  } catch (error) {
    console.error('Erreur lors de la recherche et de l\'envoi des tickets:', error);
    return {
      success: false,
      message: `Erreur: ${error.message}`,
      tickets: []
    };
  }
}

// Exporter les fonctions
module.exports = {
  sendAllTickets,
  sendLatestUserTickets
};
