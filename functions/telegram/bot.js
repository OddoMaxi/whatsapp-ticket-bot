/**
 * Bot Telegram pour l'achat de tickets avec ChapChap Pay
 */
const { Telegraf } = require('telegraf');
const paymentCommands = require('./payment-commands');

// Vous devrez fournir votre propre token de bot Telegram
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'VOTRE_TOKEN_BOT_TELEGRAM';

// Initialiser le bot
const bot = new Telegraf(BOT_TOKEN);

// Gestionnaires de commandes
bot.command('start', (ctx) => {
  ctx.reply(`Bienvenue ${ctx.from.first_name} sur le service d'achat de tickets !
  
Utilisez les commandes suivantes :
- /acheter_tickets - Acheter des tickets pour un événement
- /mes_tickets - Voir vos tickets achetés
- /aide - Obtenir de l'aide
  `);
});

bot.command('aide', (ctx) => {
  ctx.reply(`Voici la liste des commandes disponibles :

- /acheter_tickets - Démarrer le processus d'achat de tickets
- /mes_tickets - Afficher les tickets que vous avez achetés
- /aide - Afficher ce message d'aide

Pour acheter un ticket :
1. Utilisez la commande /acheter_tickets
2. Sélectionnez un événement
3. Choisissez une catégorie de ticket
4. Sélectionnez la quantité
5. Procédez au paiement via ChapChap Pay
6. Vérifiez le statut du paiement
7. Recevez vos tickets !
  `);
});

// Commande pour acheter des tickets
bot.command('acheter_tickets', paymentCommands.handleBuyTickets);

// Commande pour afficher les tickets
bot.command('mes_tickets', async (ctx) => {
  // Importez ici la logique pour récupérer et afficher les tickets de l'utilisateur
  const userId = ctx.from.id;
  const username = ctx.from.username || '';
  
  // En attendant d'implémenter cette fonctionnalité
  ctx.reply('La fonctionnalité de consultation des tickets sera bientôt disponible.');
});

// Actions pour les boutons inline
bot.action(/select_event:(.+)/, paymentCommands.handleEventSelection);
bot.action(/select_category:(.+):(.+)/, paymentCommands.handleCategorySelection);
bot.action(/select_quantity:(.+)/, paymentCommands.handleQuantitySelection);
bot.action('confirm_purchase', paymentCommands.handleConfirmPurchase);
bot.action(/check_payment:(.+)/, paymentCommands.handleCheckPayment);
bot.action('cancel_purchase', paymentCommands.handleCancelPurchase);

// Gestionnaire d'erreurs
bot.catch((err, ctx) => {
  console.error(`Erreur pour ${ctx.updateType}`, err);
  ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
});

/**
 * Démarrage du bot
 */
function startBot() {
  console.log('Bot Telegram démarré !');
  bot.launch();
  
  // Active la graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Exportation
module.exports = {
  startBot
};
