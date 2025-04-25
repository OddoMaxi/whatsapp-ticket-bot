// =============================
// INITIALISATION DU BOT TELEGRAM
// =============================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// polling: true => le bot écoute les messages entrants (mode développement ou prod unique)
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); // polling activé pour recevoir les messages

// Ici vous pouvez ajouter la logique liée au bot (listeners, commandes, etc)
// Exemple :
// telegramBot.on('message', (msg) => {
//   telegramBot.sendMessage(msg.chat.id, 'Message reçu !');
// });

module.exports = telegramBot;
