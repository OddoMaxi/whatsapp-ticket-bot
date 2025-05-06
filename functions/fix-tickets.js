// Script autonome pour envoyer tous les tickets d'une réservation
// Ce script ne dépend pas du fichier bot.js corrompu
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Version simplifiée de la fonction generate de l'index
function generateTicket(ticketData) {
  // Fonction simplifiée qui crée juste un message de ticket formaté
  const qrCode = ticketData.qrCode || '0000000';
  const eventName = ticketData.eventName || 'Événement';
  const category = ticketData.category || 'Catégorie Standard';
  const price = ticketData.price || '0';
  const ticketId = ticketData.formattedId || 'TICKET-000';
  
  return `🎫 *BILLET D'ENTRÉE*
  
*Événement:* ${eventName}
*Catégorie:* ${category}
*Prix:* ${price.toLocaleString()} GNF
*Réf:* ${ticketId}
*Code QR:* ${qrCode}

_Ce billet est valide pour une entrée. Présentez-le à l'entrée de l'événement._`;
}

// Fonction pour envoyer un ticket via Telegram
async function sendTelegramTicket(bot, chatId, ticketData) {
  const ticketMessage = generateTicket(ticketData);
  
  try {
    await bot.sendMessage(chatId, ticketMessage, { 
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    console.log(`Ticket envoyé avec succès: ${ticketData.formattedId}`);
    return true;
  } catch (error) {
    console.error(`Erreur lors de l'envoi du ticket ${ticketData.formattedId}:`, error);
    return false;
  }
}

// Fonction pour récupérer et envoyer tous les tickets d'une référence
async function sendAllTicketsForReference(bot, chatId, referenceId) {
  console.log(`Envoi de tous les tickets pour la référence ${referenceId} au chat ${chatId}`);
  
  try {
    // Connecter à la base de données
    const dbPath = path.join(__dirname, 'data.sqlite');
    const db = new Database(dbPath);
    
    // Récupérer tous les tickets avec cette référence (principal et supplémentaires)
    const tickets = db.prepare(`
      SELECT * FROM reservations 
      WHERE parent_reference = ? OR formatted_id = ? 
      ORDER BY ticket_number ASC
    `).all(referenceId, referenceId);
    
    console.log(`${tickets.length} tickets trouvés pour la référence ${referenceId}`);
    
    if (tickets.length === 0) {
      await bot.sendMessage(chatId, `Aucun ticket trouvé pour la référence ${referenceId}`);
      return {
        success: false,
        message: 'Aucun ticket trouvé',
        count: 0
      };
    }
    
    // Envoyer un message initial
    await bot.sendMessage(chatId, `📤 Envoi de ${tickets.length} tickets pour la référence ${referenceId}...`);
    
    // Envoyer chaque ticket
    let successCount = 0;
    
    for (const ticket of tickets) {
      // Préparer les données du ticket
      const ticketData = {
        eventName: ticket.event_name,
        category: ticket.category_name,
        price: ticket.unit_price,
        formattedId: ticket.formatted_id || ticket.reference || referenceId,
        qrCode: ticket.qr_code || ticket.formatted_id
      };
      
      // Numéro du ticket (principal ou supplémentaire)
      const ticketNumber = ticket.ticket_number || 1;
      console.log(`Envoi du ticket #${ticketNumber} (ID: ${ticket.id})`);
      
      // Envoyer le ticket
      const success = await sendTelegramTicket(bot, chatId, ticketData);
      
      if (success) {
        successCount++;
      }
      
      // Pause courte entre les envois
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Message de confirmation final
    await bot.sendMessage(chatId, `✅ ${successCount}/${tickets.length} tickets ont été envoyés avec succès!`);
    
    return {
      success: true,
      message: `${successCount}/${tickets.length} tickets envoyés`,
      count: successCount
    };
  } catch (error) {
    console.error(`Erreur lors de l'envoi des tickets:`, error);
    
    try {
      await bot.sendMessage(chatId, `❌ Erreur lors de l'envoi des tickets: ${error.message}`);
    } catch (msgError) {
      console.error('Erreur lors de l\'envoi du message d\'erreur:', msgError);
    }
    
    return {
      success: false,
      message: error.message,
      count: 0
    };
  }
}

// Fonction principale
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: 
  node fix-tickets.js <chatId> <referenceId>
  
Exemple:
  node fix-tickets.js 123456789 2505-9DA3D225
    `);
    process.exit(1);
  }
  
  const chatId = args[0];
  const referenceId = args[1];
  
  console.log(`Démarrage du processus d'envoi de tickets...`);
  console.log(`Chat ID: ${chatId}`);
  console.log(`Référence: ${referenceId}`);
  
  // Initialiser le bot Telegram
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  
  try {
    // Envoyer tous les tickets
    const result = await sendAllTicketsForReference(bot, chatId, referenceId);
    
    console.log(`Résultat: ${result.success ? 'Succès' : 'Échec'}`);
    console.log(`Message: ${result.message}`);
    console.log(`Nombre de tickets envoyés: ${result.count}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Erreur inattendue:', error);
    process.exit(1);
  }
}

// Exécuter le script
main().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
