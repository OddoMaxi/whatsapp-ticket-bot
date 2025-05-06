// Script pour tester l'envoi de tickets multiples
const { sendAllTickets, sendLatestUserTickets } = require('./send-all-tickets');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Définir le token du bot à partir des variables d'environnement
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

console.log('Bot de test d\'envoi de tickets démarré !');

// Commande pour tester l'envoi de tous les tickets d'une référence
telegramBot.onText(/\/sendalltix (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const referenceId = match[1];
  
  console.log(`Commande reçue: /sendalltix ${referenceId}`);
  await telegramBot.sendMessage(chatId, `Recherche des tickets pour la référence: ${referenceId}...`);
  
  try {
    const result = await sendAllTickets(referenceId, chatId);
    
    if (result.success) {
      await telegramBot.sendMessage(chatId, `✅ ${result.message}`);
    } else {
      await telegramBot.sendMessage(chatId, `❌ ${result.message}`);
    }
  } catch (error) {
    console.error('Erreur lors du test d\'envoi:', error);
    await telegramBot.sendMessage(chatId, `❌ Erreur: ${error.message}`);
  }
});

// Commande pour tester l'envoi des tickets récents d'un utilisateur
telegramBot.onText(/\/sendusertix (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = match[1];
  
  console.log(`Commande reçue: /sendusertix ${userId}`);
  await telegramBot.sendMessage(chatId, `Recherche des tickets récents pour l'utilisateur: ${userId}...`);
  
  try {
    const result = await sendLatestUserTickets(userId, chatId);
    
    if (result.success) {
      await telegramBot.sendMessage(chatId, `✅ ${result.message}`);
    } else {
      await telegramBot.sendMessage(chatId, `❌ ${result.message}`);
    }
  } catch (error) {
    console.error('Erreur lors du test d\'envoi:', error);
    await telegramBot.sendMessage(chatId, `❌ Erreur: ${error.message}`);
  }
});

// Message d'aide
telegramBot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  telegramBot.sendMessage(chatId, `Commandes disponibles:

- /sendalltix [reference] - Envoie tous les tickets associés à une référence
- /sendusertix [user_id] - Envoie tous les tickets récents d'un utilisateur
- /help - Affiche ce message d'aide

Exemple: /sendalltix 2505-9DA3D225`);
});

// Message de bienvenue
telegramBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  telegramBot.sendMessage(chatId, `🎫 Bienvenue sur le testeur d'envoi de tickets !

Utilisez les commandes suivantes:
- /sendalltix [reference] - Envoie tous les tickets associés à une référence
- /sendusertix [user_id] - Envoie tous les tickets récents d'un utilisateur
- /help - Affiche plus d'informations

Pour commencer, essayez une référence de ticket récente.`);
});

// Gestionnaire d'erreurs
telegramBot.on('polling_error', (error) => {
  console.error('Erreur de polling:', error);
});

// Active la graceful stop
process.once('SIGINT', () => telegramBot.stop('SIGINT'));
process.once('SIGTERM', () => telegramBot.stop('SIGTERM'));
