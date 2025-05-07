// =============================
// INITIALISATION DU BOT TELEGRAM
// =============================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Importation du service ChapChap Pay
const chapchapPay = require('./services/chapchap-pay');

// polling:// Récupérer le token du bot depuis les variables d'environnement
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Map pour stocker les sessions de paiement en cours (userId => sessionData)
const paymentSessions = new Map();

// Fonction pour gérer la vérification du paiement et l'envoi des tickets
async function handlePaymentVerification(chatId, userId, reference) {
  console.log(`[Bot] Vérification du paiement ${reference} pour l'utilisateur ${userId}`);
  
  // Vérifier si l'utilisateur a une session active
  if (!paymentSessions.has(userId)) {
    console.log(`[Bot] Pas de session trouvée pour l'utilisateur ${userId}`);
    return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
  }
  
  const session = paymentSessions.get(userId);
  
  // Vérifier que la référence correspond à celle de la session
  if (session.reference !== reference) {
    console.log(`[Bot] Référence de paiement invalide: ${session.reference} != ${reference}`);
    return telegramBot.sendMessage(chatId, 'Référence de paiement invalide. Veuillez réessayer.');
  }
  
  // Vérifier le statut du paiement
  try {
    const paymentStatus = await chapchapPay.checkPaymentStatus(reference);
    console.log(`[Bot] Statut du paiement ${reference}: ${paymentStatus.status}`);
    
    // Initier la connexion à la base de données
    const Database = require('better-sqlite3');
    const db = new Database(__dirname + '/data.sqlite');
    
    // Si le paiement n'est pas validé, informer l'utilisateur
    if (paymentStatus.status !== 'success' && paymentStatus.status !== 'completed' && paymentStatus.status !== 'paid') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🔄 Vérifier à nouveau', callback_data: `check_payment:${reference}` }],
          [{ text: '❌ Annuler', callback_data: 'cancel_purchase' }]
        ]
      };
      
      await telegramBot.sendMessage(
        chatId,
        `Votre paiement n'a pas encore été confirmé.\n` +
        `Statut : ${paymentStatus.status_description || paymentStatus.status}\n` +
        `Veuillez réessayer dans quelques instants.`,
        { reply_markup: keyboard }
      );
      return;
    }
    
    // Si le paiement est validé mais que la session est déjà marquée comme payée, éviter le double envoi
    if (session.step === 'paid') {
      console.log(`[Bot] Session déjà marquée comme payée pour ${reference}`);
      return telegramBot.sendMessage(chatId, 'Vos tickets ont déjà été générés et envoyés.');
    }
    
    // Mettre à jour l'état de la session
    session.step = 'paid';
    paymentSessions.set(userId, session);
    
    // Le reste du code pour générer et envoyer les tickets sera exécuté dans la fonction de vérification de paiement existante
    console.log(`[Bot] Paiement confirmé pour ${reference}, tickets prêts à être générés`);
    
    return true; // Indiquer que le paiement a été vérifié avec succès
  } catch (error) {
    console.error(`[Bot] Erreur lors de la vérification du paiement ${reference}:`, error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la vérification du paiement. Veuillez réessayer plus tard.');
    return false;
  }
}

// =============================
// COMMANDES DU BOT
// =============================

// Commande /start - Message de bienvenue
telegramBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🎟️ Acheter des tickets', callback_data: 'start_purchase' }],
      [{ text: '📋 Mes tickets', callback_data: 'my_tickets' }],
      [{ text: '❓ Aide', callback_data: 'help' }]
    ]
  };
  telegramBot.sendMessage(chatId, `Bienvenue ${msg.from.first_name} sur le service d'achat de tickets !

Choisissez une option ci-dessous:`, { reply_markup: keyboard });
});

// Commande /aide - Affiche l'aide
telegramBot.onText(/\/aide/, (msg) => {
  const chatId = msg.chat.id;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🎟️ Acheter des tickets', callback_data: 'start_purchase' }],
      [{ text: '📋 Mes tickets', callback_data: 'my_tickets' }],
      [{ text: '🏠 Retour au menu', callback_data: 'main_menu' }]
    ]
  };
  telegramBot.sendMessage(chatId, `Voici comment utiliser le service d'achat de tickets :

Pour acheter un ticket :
1. Sélectionnez un événement
2. Choisissez une catégorie de ticket
3. Sélectionnez la quantité
4. Procédez au paiement via ChapChap Pay
5. Vérifiez le statut du paiement
6. Recevez vos tickets !

Choisissez une option ci-dessous:`, { reply_markup: keyboard });
});

// Commande /acheter - Démarre le processus d'achat de tickets
telegramBot.onText(/\/acheter/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  try {
    // Vérifier si l'utilisateur a déjà une session de paiement en cours
    if (paymentSessions.has(userId)) {
      return telegramBot.sendMessage(chatId, 'Vous avez déjà une session d\'achat en cours. Veuillez la terminer ou l\'annuler avant d\'en démarrer une nouvelle.');
    }

    // Récupérer les événements disponibles depuis la base de données
    const Database = require('better-sqlite3');
    const db = new Database(__dirname + '/data.sqlite');
    
    const events = db.prepare(`
      SELECT * FROM events 
      WHERE active = 1 
      ORDER BY date
    `).all();

    if (!events || events.length === 0) {
      return telegramBot.sendMessage(chatId, 'Aucun événement disponible pour le moment.');
    }

    // Créer les boutons pour les événements
    const keyboard = {
      inline_keyboard: []
    };

    events.forEach(event => {
      keyboard.inline_keyboard.push([{
        text: event.name,
        callback_data: `select_event:${event.id}`
      }]);
    });

    // Ajouter un bouton d'annulation
    keyboard.inline_keyboard.push([{
      text: 'Annuler',
      callback_data: 'cancel_purchase'
    }]);

    await telegramBot.sendMessage(chatId, 'Veuillez sélectionner un événement :', {
      reply_markup: keyboard
    });

    // Initialiser une session de paiement
    paymentSessions.set(userId, { step: 'select_event' });

  } catch (error) {
    console.error('Erreur lors de l\'initialisation de l\'achat :', error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
  }
});

// Commande /mestickets - Affiche les tickets de l'utilisateur
telegramBot.onText(/\/mestickets/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  
  try {
    const Database = require('better-sqlite3');
    const db = new Database(__dirname + '/data.sqlite');
    
    // Récupérer les réservations de l'utilisateur (via l'ID Telegram ou le username)
    const reservations = db.prepare(`
      SELECT * FROM reservations 
      WHERE (purchase_channel = 'telegram' AND phone = ?) 
      ORDER BY created_at DESC
    `).all(username);
    
    if (!reservations || reservations.length === 0) {
      return telegramBot.sendMessage(chatId, 'Vous n\'avez pas encore acheté de tickets.');
    }
    
    // Envoyer un message avec la liste des tickets
    let message = 'Voici vos tickets achetés :\n\n';
    
    reservations.forEach((reservation, index) => {
      message += `${index + 1}. ${reservation.event_name} - ${reservation.category_name}\n`;
      message += `   Quantité: ${reservation.quantity}\n`;
      message += `   Prix: ${reservation.total_price} GNF\n`;
      message += `   Référence: ${reservation.formatted_id}\n\n`;
    });
    
    message += 'Pour voir le détail d\'un ticket, utilisez /ticket suivi du numéro de la liste.';
    
    telegramBot.sendMessage(chatId, message);
    
  } catch (error) {
    console.error('Erreur lors de la récupération des tickets :', error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
  }
});

// Commande /ticket - Affiche un ticket spécifique
telegramBot.onText(/\/ticket ([0-9]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || '';
  const ticketIndex = parseInt(match[1]) - 1;
  
  try {
    const Database = require('better-sqlite3');
    const db = new Database(__dirname + '/data.sqlite');
    
    // Récupérer les réservations de l'utilisateur
    const reservations = db.prepare(`
      SELECT * FROM reservations 
      WHERE (purchase_channel = 'telegram' AND phone = ?) 
      ORDER BY date DESC
    `).all(username);
    
    if (!reservations || reservations.length === 0 || ticketIndex < 0 || ticketIndex >= reservations.length) {
      return telegramBot.sendMessage(chatId, 'Ticket non trouvé. Veuillez vérifier le numéro du ticket.');
    }
    
    const reservation = reservations[ticketIndex];
    
    // Générer le ticket image
    // Note: cette partie dépend de l'implémentation de votre fonction generateAndSendTicket
    const generateAndSendTicket = require('./index').generateAndSendTicket;
    
    generateAndSendTicket({
      to: chatId,
      channel: 'telegram',
      eventName: reservation.event_name,
      category: reservation.category_name,
      reservationId: reservation.id,
      price: reservation.unit_price,
      formattedId: reservation.formatted_id,
      qrCode: reservation.qr_code
    });
    
  } catch (error) {
    console.error('Erreur lors de l\'affichage du ticket :', error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
  }
});

// =============================
// HANDLER TEXTE : RÉPONSE "OUI" (fallback si l'utilisateur tape au lieu de cliquer)
// =============================
telegramBot.on('message', async (msg) => {
  // Ignorer les commandes commençant par '/'
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text.trim().toLowerCase();

  // Vérifier si l'utilisateur tape "oui", "ok" ou autre confirmation alors qu'il devrait cliquer sur le bouton
  if (text === 'oui' || text === 'oui, confirmer' || text === 'yes' || text === 'ok' || text === 'Ok') {
    if (!paymentSessions.has(userId)) return; // Aucune session
    const session = paymentSessions.get(userId);

    // Seuls les états en cours de création de paiement sont acceptés
    if (session.step !== 'payment_creation') return;

    console.log('DEBUG: Réponse texte "oui" détectée, génération du lien de paiement ...', { session });

    // Reproduire la logique du callback confirm_purchase
    try {
      const Database = require('better-sqlite3');
      const db = new Database(__dirname + '/data.sqlite');

      // Vérifier la disponibilité des places
      const eventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(session.event.id);
      if (eventInfo && typeof eventInfo.available_seats === 'number' && eventInfo.available_seats < session.quantity) {
        return telegramBot.sendMessage(chatId, `Désolé, il ne reste que ${eventInfo.available_seats} place(s) disponible(s) pour cet événement.`);
      }

      // Générer une référence unique pour ce paiement
      const reference = chapchapPay.generateTransactionId();
      session.reference = reference;

      // Générer le lien de paiement
      const paymentData = {
        amount: session.totalPrice,
        description: `Achat de ${session.quantity} ticket(s) pour ${session.event.name} - ${session.category.name}`,
        reference
      };

      const paymentResponse = await chapchapPay.generatePaymentLink(paymentData);

      // Mettre à jour la session
      session.paymentUrl = paymentResponse.payment_url;
      session.step = 'payment_pending';
      paymentSessions.set(userId, session);

      // Envoyer le lien de paiement
      const keyboard = {
        inline_keyboard: [
          [{ text: '💳 Payer maintenant', url: paymentResponse.payment_url }],
          [{ text: '🔄 Vérifier le paiement', callback_data: `check_payment:${reference}` }],
          [{ text: '❌ Annuler', callback_data: 'cancel_purchase' }]
        ]
      };

      await telegramBot.sendMessage(
        chatId,
        `💸 Votre lien de paiement est prêt !\n\n` +
        `💰 Montant : ${paymentResponse.payment_amount_formatted}\n` +
        `🆔 Référence : ${reference}\n\n` +
        `⭐ Cliquez sur "Payer maintenant" pour procéder au paiement.\n` +
        `❕ Après paiement, cliquez sur "Vérifier le paiement" pour générer vos tickets.`,
        { reply_markup: keyboard }
      );
    } catch (e) {
      console.error('Erreur lors de la génération du lien de paiement (réponse texte oui) :', e);
      telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la génération du lien de paiement. Veuillez réessayer plus tard.');
    }
  }
});

// =============================
// CALLBACKS POUR LES BOUTONS INLINE
// =============================

// Callback pour la sélection d'un événement
telegramBot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  const msg = callbackQuery.message;
  const chatId = msg.chat.id;
  const userId = callbackQuery.from.id;
  
  // DEBUG: Afficher les données du callback
  console.log('=== TELEGRAM CALLBACK DEBUG ===');
  console.log('Callback data reçue:', data);
  console.log('User ID:', userId, 'Chat ID:', chatId);
  console.log('Session existante:', paymentSessions.has(userId));
  if (paymentSessions.has(userId)) {
    const session = paymentSessions.get(userId);
    console.log('Session step:', session.step);
  }
  
  // Acquitter le callback query pour éviter le chargement infini
  telegramBot.answerCallbackQuery(callbackQuery.id);
  
  try {
    // Sélection d'un événement
    if (data.startsWith('select_event:')) {
      const eventId = data.split(':')[1];
      
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      // Récupérer les informations de l'événement
      const Database = require('better-sqlite3');
      const db = new Database(__dirname + '/data.sqlite');
      
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (!event) {
        return telegramBot.sendMessage(chatId, 'Événement non trouvé. Veuillez réessayer.');
      }
      
      // Mettre à jour la session avec l'événement sélectionné
      const session = paymentSessions.get(userId);
      session.event = event;
      session.step = 'select_category';
      paymentSessions.set(userId, session);
      
      // Récupérer les catégories de l'événement
      let categories = [];
      try {
        categories = JSON.parse(event.categories || '[]');
      } catch (e) {
        categories = [{ name: 'Standard', price: 5000 }];
      }
      
      // Créer les boutons pour les catégories
      const keyboard = {
        inline_keyboard: []
      };
      
      categories.forEach(category => {
        const price = category.price || category.prix || 0;
        keyboard.inline_keyboard.push([{
          text: `${category.name} - ${price} GNF`,
          callback_data: `select_category:${category.name}:${price}`
        }]);
      });
      
      // Ajouter un bouton d'annulation
      keyboard.inline_keyboard.push([{
        text: 'Annuler',
        callback_data: 'cancel_purchase'
      }]);
      
      await telegramBot.sendMessage(
        chatId,
        `Vous avez sélectionné : ${event.name}\nVeuillez choisir une catégorie :`,
        { reply_markup: keyboard }
      );
    }
    
    // Sélection d'une catégorie
    else if (data.startsWith('select_category:')) {
      const parts = data.split(':');
      const categoryName = parts[1];
      const price = parseInt(parts[2]);
      
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      // Mettre à jour la session avec la catégorie sélectionnée
      const session = paymentSessions.get(userId);
      session.category = { name: categoryName, price: price };
      session.step = 'select_quantity';
      paymentSessions.set(userId, session);
      
      // Créer les boutons pour les quantités - version améliorée avec 5 boutons sur une même ligne
      const keyboard = {
        inline_keyboard: [
          [
            { text: '1🎟️', callback_data: 'select_quantity:1' },
            { text: '2🎟️', callback_data: 'select_quantity:2' },
            { text: '3🎟️', callback_data: 'select_quantity:3' },
            { text: '4🎟️', callback_data: 'select_quantity:4' },
            { text: '5🎟️', callback_data: 'select_quantity:5' }
          ],
          [{ text: '❌ Annuler', callback_data: 'cancel_purchase' }]
        ]
      };
      
      await telegramBot.sendMessage(
        chatId,
        `Catégorie sélectionnée : ${categoryName} - ${price} GNF\nVeuillez choisir la quantité :`,
        { reply_markup: keyboard }
      );
    }
    
    // Sélection de la quantité
    else if (data.startsWith('select_quantity:')) {
      const quantity = parseInt(data.split(':')[1]);
      
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        console.log('ERREUR: Session non trouvée pour l\'utilisateur', userId);
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      // Mettre à jour la session avec la quantité sélectionnée
      const session = paymentSessions.get(userId);
      session.quantity = parseInt(quantity, 10); // S'assurer que la quantité est un nombre entier
      session.step = 'payment_creation';
      session.totalPrice = session.category.price * session.quantity;
      paymentSessions.set(userId, session);
      
      console.log(`[Bot] Quantité sélectionnée: ${session.quantity} (type: ${typeof session.quantity})`);
      
      // Afficher le récapitulatif et demander confirmation avec des boutons plus explicites
      const confirmKeyboard = {
        inline_keyboard: [
          [{
            text: '✅ Confirmer et payer',
            callback_data: 'confirm_purchase'
          }],
          [{
            text: '🔙 Modifier la quantité',
            callback_data: `select_category:${session.category.name}:${session.category.price}`
          }],
          [{
            text: '❌ Annuler l\'achat',
            callback_data: 'cancel_purchase'
          }]
        ]
      };
      
      await telegramBot.sendMessage(
        chatId,
        `Récapitulatif de votre commande :\n` +
        `Événement : ${session.event.name}\n` +
        `Catégorie : ${session.category.name}\n` +
        `Quantité : ${quantity}\n` +
        `Prix unitaire : ${session.category.price} GNF\n` +
        `Prix total : ${session.totalPrice} GNF\n\n` +
        `Cliquez sur "Oui, confirmer" pour procéder au paiement.`,
        { reply_markup: confirmKeyboard }
      );
    }
    
    // Confirmer l'achat et générer le lien de paiement
    else if (data === 'confirm_purchase') {
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        console.log('ERREUR: Session non trouvée pour l\'utilisateur', userId);
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      const session = paymentSessions.get(userId);
      await telegramBot.sendMessage(chatId, 'Génération du lien de paiement en cours...');
      
      // Générons le lien de paiement
      try {
        const Database = require('better-sqlite3');
        const db = new Database(__dirname + '/data.sqlite');
        console.log('Connexion à la base de données établie');

        // Vérifier la disponibilité des places
        const eventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(session.event.id);
        if (eventInfo && typeof eventInfo.available_seats === 'number' && eventInfo.available_seats < session.quantity) {
          return telegramBot.sendMessage(chatId, `Désolé, il ne reste que ${eventInfo.available_seats} place(s) disponible(s) pour cet événement.`);
        }

        // Générer une référence unique pour ce paiement
        const reference = chapchapPay.generateTransactionId();
        session.reference = reference;

        // Générer le lien de paiement
        const paymentData = {
          amount: session.totalPrice,
          description: `Achat de ${session.quantity} ticket(s) pour ${session.event.name} - ${session.category.name}`,
          reference
        };

        console.log('Données de paiement prêtes:', JSON.stringify(paymentData));
        await telegramBot.sendMessage(chatId, 'Génération du lien de paiement en cours...');

        console.log('Appel au service chapchapPay.generatePaymentLink...');
        const paymentResponse = await chapchapPay.generatePaymentLink(paymentData);

        // Stocker les informations de paiement dans la session
        session.paymentUrl = paymentResponse.payment_url;
        session.step = 'payment_pending';
        paymentSessions.set(userId, session);

        // Envoyer le lien de paiement
        const keyboard = {
          inline_keyboard: [
            [{
              text: '💳 Payer maintenant',
              url: paymentResponse.redirect_url
            }],
            [{
              text: '❌ Annuler',
              callback_data: 'cancel_purchase'
            }]
          ]
        };

        await telegramBot.sendMessage(
          chatId,
          `💸 Votre lien de paiement est prêt !\n\n` +
          `💰 Montant : ${paymentResponse.payment_amount_formatted}\n` +
          `🆔 Référence : ${reference}\n\n` +
          `⭐ Cliquez sur "Payer maintenant" pour procéder au paiement.\n` +
          `✅ Vos tickets seront automatiquement générés une fois le paiement confirmé.`,
          { reply_markup: keyboard }
        );

        // Configuration de la vérification automatique du paiement
        console.log('[Bot] Configuration de la vérification automatique du paiement');

        // Vérifier le statut du paiement toutes les 10 secondes pendant 5 minutes (30 tentatives)
        let checkAttempts = 0;
        const maxCheckAttempts = 30;

        const paymentCheckInterval = setInterval(async () => {
          checkAttempts++;
          console.log(`[Bot] Vérification automatique du paiement ${reference} - tentative ${checkAttempts}/${maxCheckAttempts}`);

          // Si l'utilisateur a annulé l'achat ou la session n'existe plus, arrêter les vérifications
          if (!paymentSessions.has(userId) || paymentSessions.get(userId).step === 'paid') {
            console.log(`[Bot] Arrêt des vérifications : l'utilisateur a annulé ou la session est terminée`);
            clearInterval(paymentCheckInterval);
            return;
          }

          try {
            // Vérifier le statut du paiement
            const paymentStatus = await chapchapPay.checkPaymentStatus(reference);
            console.log(`[Bot] Statut du paiement ${reference} : ${paymentStatus.status}`);

            // Si le paiement est validé, générer automatiquement les tickets
            if (paymentStatus.status === 'success' || paymentStatus.status === 'completed' || paymentStatus.status === 'paid') {
              console.log(`[Bot] Paiement ${reference} confirmé, génération automatique des tickets`);
              clearInterval(paymentCheckInterval);

              // Utiliser la fonction existante pour vérifier le paiement
              await handlePaymentVerification(chatId, userId, reference);
            }

            // Arrêter les vérifications après le nombre maximum de tentatives
            if (checkAttempts >= maxCheckAttempts) {
              console.log(`[Bot] Nombre maximum de vérifications atteint pour le paiement ${reference}`);
              clearInterval(paymentCheckInterval);

              // Informer l'utilisateur
              const manualCheckKeyboard = {
                inline_keyboard: [[
                  {
                    text: '🔄 Vérifier mon paiement',
                    callback_data: `check_payment:${reference}`
                  }
                ]]
              };

              await telegramBot.sendMessage(
                chatId,
                `⏰ La vérification automatique de votre paiement est terminée.\n\n` +
                `Si vous avez déjà effectué le paiement mais n'avez pas reçu vos tickets, vous pouvez vérifier manuellement.`,
                { reply_markup: manualCheckKeyboard }
              );
            }
          } catch (error) {
            console.error(`[Bot] Erreur lors de la vérification automatique du paiement ${reference} :`, error);
          }
        }, 10000); // Vérification toutes les 10 secondes
      } catch (error) {
        console.error('Erreur lors de la génération du lien de paiement:', error);
        telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la génération du lien de paiement. Veuillez réessayer plus tard.');
      }
    }

    
    // Vérification du paiement
    else if (data.startsWith('check_payment:')) {
      console.log('=== DÉBUT VÉRIFICATION DE PAIEMENT ===');
      const reference = data.split(':')[1];
      console.log('Référence de paiement:', reference);
      
      // Message d'attente pendant la vérification
      await telegramBot.sendMessage(chatId, 'Vérification du statut de votre paiement...');
      
      // Utiliser la fonction de vérification du paiement
      const paymentVerified = await handlePaymentVerification(chatId, userId, reference);
      
      // Si le paiement n'est pas vérifié avec succès, arrêter là
      if (!paymentVerified) {
        return;
      }
      
      // Récupérer la session mise à jour
      const session = paymentSessions.get(userId);
      
      // Initier la connexion à la base de données pour la génération de tickets
      const Database = require('better-sqlite3');
      const db = new Database(__dirname + '/data.sqlite');
      console.log('Connexion à la base de données établie pour la génération de tickets');
      
      // Le statut de paiement est déjà vérifié dans handlePaymentVerification
      // Suite du traitement pour générer les tickets
      try {
        console.log('Paiement confirmé pour cette session');
        console.log('DEBUG: Session actuelle après confirmation du paiement:', JSON.stringify(session, null, 2));
        console.log('DEBUG: Quantité de tickets détectée:', session.quantity, typeof session.quantity);
        
        // S'assurer que session.quantity est un nombre et qu'il est au moins 1
        if (session.quantity === undefined || session.quantity === null || isNaN(Number(session.quantity))) {
          console.log('DEBUG: Quantité non définie ou invalide dans la session. Réglage sur 1.');
          session.quantity = 1;
        } else {
          // Convertir explicitement en nombre pour éviter les problèmes de type
          session.quantity = Number(session.quantity);
          console.log('DEBUG: Quantité convertie en nombre:', session.quantity);
        }
        
        // Mettre à jour la session
        paymentSessions.set(userId, session);
        
        // Récupérer l'événement avec les données actuelles
        const event = db.prepare('SELECT * FROM events WHERE id = ?').get(session.event.id);
        if (!event) {
          throw new Error(`Événement avec l'ID ${session.event.id} introuvable`);
        }
        
        // Mise à jour du nombre total de places disponibles
        if (typeof event.available_seats === 'number') {
          const newAvailableSeats = Math.max(0, event.available_seats - session.quantity);
          db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(newAvailableSeats, session.event.id);
          console.log(`[Bot] Nombre total de places mis à jour pour l'événement #${session.event.id}: ${event.available_seats} -> ${newAvailableSeats}`);
        }
        
        // Mise à jour de la quantité spécifique à la catégorie
        const categoriesStr = event.categories;
        if (categoriesStr) {
          // Paiement réussi, procéder à la création des tickets
          await telegramBot.sendMessage(chatId, 'Paiement confirmé ! Génération de vos tickets en cours...');
          
          // Créer la réservation dans la base de données
          const username = callbackQuery.from.username || '';
          const fullName = callbackQuery.from.first_name + ' ' + (callbackQuery.from.last_name || '');
          
          // Insérer la réservation avec statut de paiement
          // Vérifier si les colonnes de paiement existent dans la table
          let insertResult;
          try {
            // Vérifier si les colonnes payment_reference et payment_status existent
            const columns = db.prepare("PRAGMA table_info(reservations)").all();
            const hasPaymentColumns = columns.some(col => col.name === 'payment_reference') && 
                                       columns.some(col => col.name === 'payment_status');
            
            console.log('Colonnes de paiement disponibles:', hasPaymentColumns);
            
            // Générer la date actuelle pour la réservation
            const currentDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
            
            // Générer un code QR unique à 7 chiffres pour le ticket principal
            const qrCode = chapchapPay.generateQRCode();
            console.log(`[Bot] Nouveau QR code généré pour le ticket principal : ${qrCode}`);

            if (hasPaymentColumns) {
              // Version avec colonnes de paiement
              insertResult = db.prepare(`
                INSERT INTO reservations 
                (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, payment_reference, payment_status, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                fullName,
                username,
                session.event.id,
                session.event.name,
                session.category.name,
                session.quantity,
                session.category.price,
                session.totalPrice,
                'telegram',
                reference,
                qrCode,    // Utiliser un code QR unique à 7 chiffres au lieu de la référence
                reference,
                'paid',
                currentDate
              );
            } else {
              // Version sans colonnes de paiement
              insertResult = db.prepare(`
                INSERT INTO reservations 
                (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                fullName,
                username,
                session.event.id,
                session.event.name,
                session.category.name,
                session.quantity,
                session.category.price,
                session.totalPrice,
                'telegram',
                reference,
                qrCode,    // Utiliser un code QR unique à 7 chiffres au lieu de la référence
                currentDate
              );
            }
          } catch (sqlError) {
            console.error('Erreur SQL lors de l\'insertion de la réservation:', sqlError);
            // Fallback avec une version minimale sans vérification de colonnes
            const currentDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
            insertResult = db.prepare(`
              INSERT INTO reservations 
              (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              fullName,
              username,
              session.event.id,
              session.event.name,
              session.category.name,
              session.quantity,
              session.category.price,
              session.totalPrice,
              currentDate // Ajouter le paramètre manquant pour la date
            );
          }
          
          // Mettre à jour le nombre de places disponibles (total et par catégorie)
          try {
            // Récupérer l'événement avec les données actuelles
            const event = db.prepare('SELECT * FROM events WHERE id = ?').get(session.event.id);
            if (!event) {
              throw new Error(`Événement avec l'ID ${session.event.id} introuvable`);
            }
            
            // Mise à jour du nombre total de places disponibles
            if (typeof event.available_seats === 'number') {
              const newAvailableSeats = Math.max(0, event.available_seats - session.quantity);
              db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(newAvailableSeats, session.event.id);
              console.log(`[Bot] Nombre total de places mis à jour pour l'événement #${session.event.id}: ${event.available_seats} -> ${newAvailableSeats}`);
            }
            
            // Mise à jour de la quantité spécifique à la catégorie
            const categoriesStr = event.categories;
            if (categoriesStr) {
              try {
                let categories = JSON.parse(categoriesStr);
                const categoryIndex = categories.findIndex(cat => cat.name === session.category.name);
                
                if (categoryIndex !== -1) {
                  const cat = categories[categoryIndex];
                  const qtyBefore = cat.quantite !== undefined ? cat.quantite : (cat.quantity !== undefined ? cat.quantity : 0);
                  
                  // Mise à jour de la quantité (gestion des deux noms de propriété possibles: quantite ou quantity)
                  if (cat.quantite !== undefined) {
                    cat.quantite = Math.max(0, cat.quantite - session.quantity);
                    console.log(`[Bot] Quantité ('quantite') mise à jour pour ${cat.name}: ${qtyBefore} -> ${cat.quantite}`);
                  } else if (cat.quantity !== undefined) {
                    cat.quantity = Math.max(0, cat.quantity - session.quantity);
                    console.log(`[Bot] Quantité ('quantity') mise à jour pour ${cat.name}: ${qtyBefore} -> ${cat.quantity}`);
                  }
                  
                  // Sauvegarder les catégories mises à jour
                  const updateResult = db.prepare('UPDATE events SET categories = ? WHERE id = ?').run(JSON.stringify(categories), session.event.id);
                  console.log(`[Bot] Catégorie mise à jour pour l'événement #${session.event.id}:`, { updateResult });
                } else {
                  console.error(`[Bot] Catégorie ${session.category.name} introuvable dans l'événement #${session.event.id}`);
                }
              } catch (jsonError) {
                console.error('Erreur lors du traitement JSON des catégories:', jsonError);
              }
            } else {
              console.error(`[Bot] Aucune catégorie trouvée pour l'événement #${session.event.id}`);
            }
          } catch (updateError) {
            console.error('Erreur lors de la mise à jour des places disponibles:', updateError);
          }
          
          // Vérifier et ajouter les colonnes nécessaires à la table reservations si elles n'existent pas
          try {
            // Vérifier si la colonne order_reference existe pour lier tous les tickets d'une même commande
            const columns = db.prepare("PRAGMA table_info(reservations)").all();
            const hasOrderReference = columns.some(col => col.name === 'order_reference');
            
            // Ajouter la colonne order_reference si nécessaire
            if (!hasOrderReference) {
              console.log('[Bot] Ajout de la colonne order_reference à la table reservations');
              db.prepare("ALTER TABLE reservations ADD COLUMN order_reference TEXT").run();
            }
          } catch (schemaError) {
            console.error('[Bot] Erreur lors de la vérification/modification du schéma:', schemaError);
          }
          
          // Créer une référence de commande unique pour relier tous les tickets
          const orderReference = chapchapPay.generateTransactionId();
          console.log(`[Bot] Référence de commande générée : ${orderReference}`);
          
          // On convertit explicitement la quantité en nombre entier
          const ticketQuantity = parseInt(session.quantity, 10);
          console.log(`[Bot] Génération de ${ticketQuantity} tickets pour la commande ${orderReference}`);
          
          // Génération des tickets (on assume que le paiement est validé puisqu'on est dans cette partie du code)
          // Correction de l'erreur ReferenceError: paymentStatus is not defined
          const paymentStatusIsValid = true; // On assume que le paiement est validé car nous sommes dans cette section du code
          if (paymentStatusIsValid) {
            // Définir la date actuelle pour tous les tickets
            const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');
            console.log(`[Bot] Date de génération des tickets: ${currentDate}`);
            
            // Générer tous les tickets individuellement avec un QR code unique
            const generatedTickets = [];
            
            for (let i = 0; i < ticketQuantity; i++) {
              try {
                // Générer un QR code unique pour chaque ticket
                const uniqueQRCode = chapchapPay.generateQRCode();
                const ticketNumber = i + 1;
                const formattedTicketId = `${orderReference}-${ticketNumber}`;
                
                console.log(`[Bot] Génération du ticket #${ticketNumber} avec QR code: ${uniqueQRCode}`);
                
                // Préparer la requête SQL avec la colonne order_reference
                const sql = `
                  INSERT INTO reservations 
                  (user, phone, event_id, event_name, category_name, quantity, unit_price, 
                   total_price, purchase_channel, formatted_id, qr_code, date, order_reference)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                // Insérer le ticket dans la base de données
                const insertResult = db.prepare(sql).run(
                  fullName,
                  username,
                  session.event.id,
                  session.event.name,
                  session.category.name,
                  1, // Chaque ticket est individuel
                  session.category.price,
                  session.category.price, // Prix unitaire
                  'telegram',
                  formattedTicketId,
                  uniqueQRCode, // Code QR unique aléatoire
                  currentDate,
                  orderReference // Référence commune pour tous les tickets de cette commande
                );
                
                console.log(`[Bot] Ticket #${ticketNumber} inséré avec succès. ID: ${insertResult.lastInsertRowid}`);
                
                // Stocker les informations du ticket pour l'envoi ultérieur
                generatedTickets.push({
                  id: insertResult.lastInsertRowid,
                  eventName: session.event.name,
                  categoryName: session.category.name,
                  price: session.category.price,
                  formattedId: formattedTicketId,
                  qrCode: uniqueQRCode,
                  ticketNumber
                });
              } catch (ticketError) {
                console.error(`[Bot] Erreur lors de la génération du ticket #${i+1}:`, ticketError);
              }
            }
            
            // Après avoir généré tous les tickets, on les envoie à l'utilisateur
            session.generatedTickets = generatedTickets;
            session.orderReference = orderReference;
            paymentSessions.set(userId, session);
            
            console.log(`[Bot] ${generatedTickets.length} tickets générés avec succès pour la commande ${orderReference}`);
          } else {
            console.log(`[Bot] Paiement non validé (status: ${paymentStatus.status}), aucun ticket généré`);
          }
          
          // Référence à la fonction de génération de ticket
          const generateAndSendTicket = require('./index').generateAndSendTicket;

          // Envoyer les tickets si le paiement est validé
          if (session.step === 'paid' && session.generatedTickets && session.generatedTickets.length > 0) {
            console.log(`[Bot] Envoi de ${session.generatedTickets.length} tickets à l'utilisateur ${fullName} (ID: ${userId})`);

            
            // Envoi de tous les tickets générés
            for (const ticket of session.generatedTickets) {
              try {
                console.log(`[Bot] Envoi du ticket #${ticket.ticketNumber} avec QR code ${ticket.qrCode}`);
                
                generateAndSendTicket({
                  to: chatId,
                  channel: 'telegram',
                  eventName: ticket.eventName,
                  category: ticket.categoryName,
                  reservationId: ticket.id,
                  price: ticket.price,
                  formattedId: ticket.formattedId,
                  qrCode: ticket.qrCode
                });
                
                // Petite pause entre chaque envoi pour éviter les limitations API
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (sendError) {
                console.error(`[Bot] Erreur lors de l'envoi du ticket ${ticket.id}:`, sendError);
              }
            }

            // Envoyer un message de confirmation
            const keyboard = {
              inline_keyboard: [
                [{ text: '📋 Mes tickets', callback_data: 'my_tickets' }],
                [{ text: '🎟️ Acheter plus de tickets', callback_data: 'start_purchase' }]
              ]
            };
            
            await telegramBot.sendMessage(
              chatId,
              `🎉 Vos tickets ont été générés avec succès !\n\n` +
              `💳 Référence de commande : ${session.orderReference}\n` +
              `🎟️ Nombre de tickets : ${session.generatedTickets.length}\n` +
              `🔔 Chaque ticket a un code QR unique pour l'accès`,
              { reply_markup: keyboard }
            );

            // Nettoyer la session
            paymentSessions.delete(userId);
          } else {
            // Si on arrive ici, on n'a pas généré de tickets car le paiement n'est pas validé
            console.log('DEBUG: Pas de génération de tickets - paiement non validé', { session });
            await telegramBot.sendMessage(chatId, 'Les tickets seront générés une fois le paiement validé.');
          }
          
        } else if (paymentStatus.status === 'pending') {
          // Paiement en attente
          const keyboard = {
            inline_keyboard: [
              [{
                text: 'Vérifier à nouveau',
                callback_data: `check_payment:${reference}`
              }],
              [{
                text: 'Annuler',
                callback_data: 'cancel_purchase'
              }]
            ]
          };
          
          await telegramBot.sendMessage(
            chatId,
            `Votre paiement est en cours de traitement.\n` +
            `Statut actuel : ${paymentStatus.status_description}\n` +
            `Veuillez réessayer dans quelques instants.`,
            { reply_markup: keyboard }
          );
        } else {
          // Paiement échoué ou autre statut
          const keyboard = {
            inline_keyboard: [
              [{
                text: 'Réessayer le paiement',
                url: session.paymentUrl
              }],
              [{
                text: 'Vérifier à nouveau',
                callback_data: `check_payment:${reference}`
              }],
              [{
                text: 'Annuler',
                callback_data: 'cancel_purchase'
              }]
            ]
          };
          
          await telegramBot.sendMessage(
            chatId,
            `Votre paiement n'a pas été confirmé.\n` +
            `Statut : ${paymentStatus.status_description}\n` +
            `Erreur : ${paymentStatus.error_message || 'Aucune erreur spécifiée'}\n\n` +
            `Vous pouvez réessayer le paiement ou annuler votre commande.`,
            { reply_markup: keyboard }
          );
        }
      } catch (error) {
        console.error('Erreur lors de la génération et envoi des tickets :', error);
        telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la génération des tickets. Veuillez contacter le support.');
      }
    }
    
    // Annulation de l'achat
    else if (data === 'cancel_purchase') {
      // Supprimer la session de paiement
      paymentSessions.delete(userId);
      
      await telegramBot.sendMessage(chatId, 'Votre commande a été annulée. Vous pouvez démarrer un nouvel achat avec la commande /acheter');
    }
    
    // Nouveaux boutons
    else if (data === 'start_purchase') {
      // Vérifier si l'utilisateur a déjà une session de paiement en cours
      if (paymentSessions.has(userId)) {
        return telegramBot.sendMessage(chatId, 'Vous avez déjà une session d\'achat en cours. Veuillez la terminer ou l\'annuler avant d\'en démarrer une nouvelle.');
      }

      // Récupérer les événements disponibles depuis la base de données
      const Database = require('better-sqlite3');
      const db = new Database(__dirname + '/data.sqlite');
      
      const events = db.prepare(`
        SELECT * FROM events 
        WHERE active = 1 
        ORDER BY date
      `).all();

      if (!events || events.length === 0) {
        return telegramBot.sendMessage(chatId, 'Aucun événement disponible pour le moment.');
      }

      // Créer les boutons pour les événements
      const keyboard = {
        inline_keyboard: []
      };

      events.forEach(event => {
        keyboard.inline_keyboard.push([{
          text: event.name,
          callback_data: `select_event:${event.id}`
        }]);
      });

      // Ajouter un bouton d'annulation
      keyboard.inline_keyboard.push([{
        text: 'Annuler',
        callback_data: 'cancel_purchase'
      }]);

      await telegramBot.sendMessage(chatId, 'Veuillez sélectionner un événement :', {
        reply_markup: keyboard
      });

      // Initialiser une session de paiement
      paymentSessions.set(userId, { step: 'select_event' });
    }
    else if (data === 'my_tickets') {
      const fullName = callbackQuery.from.first_name + (callbackQuery.from.last_name ? ' ' + callbackQuery.from.last_name : '');
      const username = callbackQuery.from.username || '';
      try {
        const Database = require('better-sqlite3');
        const db = new Database(__dirname + '/data.sqlite');
        
        // Récupérer toutes les commandes (groups de tickets) de l'utilisateur
        const orders = db.prepare(`
          SELECT order_reference, event_name, category_name, unit_price, date, COUNT(*) as ticket_count
          FROM reservations 
          WHERE purchase_channel = 'telegram' AND phone = ? 
          GROUP BY order_reference
          ORDER BY date DESC
        `).all(username);
        
        if (!orders || orders.length === 0) {
          return telegramBot.sendMessage(chatId, 'Vous n\'avez pas encore acheté de tickets.');
        }
        
        // Envoyer un message avec la liste des commandes et tickets
        let message = `📋 *Vos tickets achetés*\n\n`;
        
        orders.forEach((order, index) => {
          const date = new Date(order.date);
          const formattedDate = date.toLocaleDateString('fr-FR');
          
          message += `*Commande ${index + 1}* - ${formattedDate}\n`;
          message += `🎭 Événement: *${order.event_name}*\n`;
          message += `🎟️ Catégorie: ${order.category_name}\n`;
          message += `🔢 Nombre de tickets: ${order.ticket_count}\n`;
          message += `💰 Prix total: ${order.unit_price * order.ticket_count} GNF\n`;
          message += `🆔 Référence: ${order.order_reference}\n\n`;
        });
        
        message += 'Pour voir vos tickets, utilisez /tickets suivi du numéro de commande.';
        
        // Ajouter des boutons pour visualiser les commandes
        const keyboard = {
          inline_keyboard: []
        };
        
        // Ajouter un bouton pour chaque commande (limité à 5 pour éviter de dépasser la limite de boutons)
        const maxButtons = Math.min(orders.length, 5);
        for (let i = 0; i < maxButtons; i++) {
          keyboard.inline_keyboard.push([{
            text: `Voir tickets commande ${i+1}`,
            callback_data: `view_order:${i+1}`
          }]);
        }
        
        // Ajouter un bouton pour retourner au menu principal
        keyboard.inline_keyboard.push([{
          text: '🎭 Acheter des tickets',
          callback_data: 'start_purchase'
        }]);
        
        telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
        
      } catch (error) {
        console.error('Erreur lors de la récupération des tickets :', error);
        telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
      }
    }
    else if (data === 'help') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🎟️ Acheter des tickets', callback_data: 'start_purchase' }],
          [{ text: '📋 Mes tickets', callback_data: 'my_tickets' }],
          [{ text: '🏠 Retour au menu', callback_data: 'main_menu' }]
        ]
      };
      telegramBot.sendMessage(chatId, `Voici comment utiliser le service d'achat de tickets :

Pour acheter un ticket :
1. Sélectionnez un événement
2. Choisissez une catégorie de ticket
3. Sélectionnez la quantité
4. Procédez au paiement via ChapChap Pay
5. Vérifiez le statut du paiement
6. Recevez vos tickets !

Choisissez une option ci-dessous:`, { reply_markup: keyboard });
    }
    else if (data === 'main_menu') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🎟️ Acheter des tickets', callback_data: 'start_purchase' }],
          [{ text: '📋 Mes tickets', callback_data: 'my_tickets' }],
          [{ text: '❓ Aide', callback_data: 'help' }]
        ]
      };
      telegramBot.sendMessage(chatId, `Retour au menu principal. Choisissez une option ci-dessous:`, { reply_markup: keyboard });
    }
    
    // Gestionnaire pour visualiser les tickets d'une commande
    else if (data.startsWith('view_order:')) {
      const orderIndex = parseInt(data.split(':')[1], 10) - 1; // Convertir en index basé sur 0
      const username = callbackQuery.from.username || '';
      
      try {
        const Database = require('better-sqlite3');
        const db = new Database(__dirname + '/data.sqlite');
        
        // Récupérer toutes les commandes de l'utilisateur
        const orders = db.prepare(`
          SELECT order_reference, event_name, category_name, date
          FROM reservations 
          WHERE purchase_channel = 'telegram' AND phone = ? 
          GROUP BY order_reference
          ORDER BY date DESC
        `).all(username);
        
        if (!orders || orderIndex >= orders.length) {
          return telegramBot.sendMessage(chatId, 'Commande introuvable.');
        }
        
        const selectedOrder = orders[orderIndex];
        
        // Récupérer tous les tickets de cette commande
        const tickets = db.prepare(`
          SELECT id, formatted_id, qr_code, unit_price
          FROM reservations
          WHERE order_reference = ?
          ORDER BY formatted_id
        `).all(selectedOrder.order_reference);
        
        if (!tickets || tickets.length === 0) {
          return telegramBot.sendMessage(chatId, 'Aucun ticket trouvé pour cette commande.');
        }
        
        // Afficher les détails de la commande et de ses tickets
        let message = `🎟️ *Détails de la commande*\n\n`;
        message += `🎭 Événement: *${selectedOrder.event_name}*\n`;
        message += `🎟️ Catégorie: ${selectedOrder.category_name}\n`;
        message += `🔢 Nombre de tickets: ${tickets.length}\n`;
        message += `🆔 Référence: ${selectedOrder.order_reference}\n\n`;
        message += `*Liste des tickets:*\n`;
        
        tickets.forEach((ticket, index) => {
          message += `${index + 1}. Ticket ${ticket.formatted_id}\n`;
          message += `   Code QR: ${ticket.qr_code}\n`;
          message += `   Prix: ${ticket.unit_price} GNF\n\n`;
        });
        
        // Ajouter un bouton pour retourner à la liste des commandes
        const keyboard = {
          inline_keyboard: [
            [{ text: '🔙 Retour aux commandes', callback_data: 'my_tickets' }],
            [{ text: '🎭 Acheter plus de tickets', callback_data: 'start_purchase' }]
          ]
        };
        
        await telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
      } catch (error) {
        console.error('Erreur lors de la récupération des tickets :', error);
        telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la récupération des tickets. Veuillez réessayer.');
      }
    }
    
  } catch (error) {
    console.error('Erreur lors du traitement du callback :', error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
  }
});

// Exposer des fonctions pour permettre la gestion des sessions de paiement depuis l'extérieur

// Création d'une session de paiement depuis l'extérieur (ex: index.js)
telegramBot.createPaymentSession = function(userId, sessionData) {
  console.log('Creation directe d\'une session depuis l\'extérieur', { userId, sessionData });
  paymentSessions.set(userId, sessionData);
  return true;
};

// Autres fonctions d'accès aux sessions
telegramBot.getPaymentSession = function(userId) {
  return paymentSessions.get(userId);
};

telegramBot.deletePaymentSession = function(userId) {
  return paymentSessions.delete(userId);
};

telegramBot.hasPaymentSession = function(userId) {
  return paymentSessions.has(userId);
};

module.exports = telegramBot;
