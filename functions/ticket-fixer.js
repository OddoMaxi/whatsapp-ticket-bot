// Script de récupération et envoi de tickets multiples (solution autonome)
const Database = require('better-sqlite3');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Configuration 
const CHAT_ID = process.argv[2] || ''; // Premier argument: ID chat Telegram
const REFERENCE = process.argv[3] || ''; // Deuxième argument: référence de réservation

// Assurez-vous que les paramètres nécessaires sont fournis
if (!CHAT_ID || !REFERENCE) {
  console.error('Usage: node ticket-fixer.js <chat_id> <reference_id>');
  console.error('Exemple: node ticket-fixer.js 5690412192 2505-9DA3D225');
  process.exit(1);
}

// Connexion à la base de données
const db = new Database(path.join(__dirname, 'data.sqlite'));

// Fonction simplifiée pour générer un message de ticket
function generateTicketMessage(ticket) {
  return `🎫 *BILLET D'ENTRÉE*

*Événement:* ${ticket.event_name}
*Catégorie:* ${ticket.category_name}
*Prix:* ${ticket.unit_price.toLocaleString()} GNF
*Réf:* ${ticket.formatted_id || ticket.reference}
*Code QR:* ${ticket.qr_code}

_Ce billet est valide pour une entrée. Présentez-le à l'entrée de l'événement._`;
}

// Fonction principale
async function main() {
  try {
    console.log(`Recherche des tickets pour la référence ${REFERENCE}...`);
    
    // Récupérer tous les tickets associés à cette référence
    const tickets = db.prepare(`
      SELECT * FROM reservations 
      WHERE parent_reference = ? OR formatted_id = ? 
      ORDER BY ticket_number ASC
    `).all(REFERENCE, REFERENCE);

    console.log(`${tickets.length} tickets trouvés`);
    
    if (tickets.length === 0) {
      console.error(`Aucun ticket trouvé pour la référence ${REFERENCE}`);
      process.exit(1);
    }

    // Initialiser le bot Telegram
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    
    // Envoyer le message initial
    await bot.sendMessage(CHAT_ID, `📤 Envoi de ${tickets.length} tickets pour la référence ${REFERENCE}...`);

    // Envoyer chaque ticket
    let sentCount = 0;
    for (const ticket of tickets) {
      try {
        const ticketMessage = generateTicketMessage(ticket);
        
        console.log(`Envoi du ticket #${ticket.ticket_number || 1} (${ticket.formatted_id})...`);
        
        await bot.sendMessage(CHAT_ID, ticketMessage, {
          parse_mode: 'Markdown'
        });
        
        sentCount++;
        console.log(`Ticket #${ticket.ticket_number || 1} envoyé avec succès!`);
        
        // Pause brève entre les envois
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Erreur lors de l'envoi du ticket #${ticket.ticket_number || 1}:`, error);
      }
    }
    
    // Message de confirmation final
    await bot.sendMessage(CHAT_ID, `✅ ${sentCount}/${tickets.length} tickets ont été envoyés avec succès!`);
    
    console.log(`${sentCount}/${tickets.length} tickets ont été envoyés avec succès!`);
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
}

// Exécuter
main().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
