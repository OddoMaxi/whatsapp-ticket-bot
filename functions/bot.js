// =============================
// INITIALISATION DU BOT TELEGRAM
// =============================
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

// Importation du service ChapChap Pay
const chapchapPay = require('./services/chapchap-pay');

// polling: true => le bot écoute les messages entrants (mode développement ou prod unique)
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true }); // polling activé pour recevoir les messages

// Stockage des sessions de paiement temporaires
const paymentSessions = new Map();

// =============================
// COMMANDES DU BOT
// =============================

// Commande /start - Message de bienvenue
telegramBot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  telegramBot.sendMessage(chatId, `Bienvenue ${msg.from.first_name} sur le service d'achat de tickets !
  
Utilisez les commandes suivantes :
- /acheter - Acheter des tickets pour un événement
- /mestickets - Voir vos tickets achetés
- /aide - Obtenir de l'aide`);
});

// Commande /aide - Affiche l'aide
telegramBot.onText(/\/aide/, (msg) => {
  const chatId = msg.chat.id;
  telegramBot.sendMessage(chatId, `Voici la liste des commandes disponibles :

- /acheter - Démarrer le processus d'achat de tickets
- /mestickets - Afficher les tickets que vous avez achetés
- /aide - Afficher ce message d'aide

Pour acheter un ticket :
1. Utilisez la commande /acheter
2. Sélectionnez un événement
3. Choisissez une catégorie de ticket
4. Sélectionnez la quantité
5. Procédez au paiement via ChapChap Pay
6. Vérifiez le statut du paiement
7. Recevez vos tickets !`);
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
      ORDER BY created_at DESC
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
      
      // Créer les boutons pour les quantités
      const keyboard = {
        inline_keyboard: [
          [1, 2, 3].map(qty => ({
            text: `${qty}`,
            callback_data: `select_quantity:${qty}`
          })),
          [4, 5, 6].map(qty => ({
            text: `${qty}`,
            callback_data: `select_quantity:${qty}`
          })),
          [{
            text: 'Annuler',
            callback_data: 'cancel_purchase'
          }]
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
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      // Mettre à jour la session avec la quantité sélectionnée
      const session = paymentSessions.get(userId);
      session.quantity = quantity;
      session.step = 'confirm_purchase';
      session.totalPrice = session.category.price * quantity;
      paymentSessions.set(userId, session);
      
      // Demander confirmation
      console.log('=== CRÉATION DU BOUTON DE CONFIRMATION ===');
      const keyboard = {
        inline_keyboard: [
          [{
            text: 'Confirmer et payer',
            callback_data: 'confirm_purchase'
          }, {
            text: 'Annuler',
            callback_data: 'cancel_purchase'
          }]
        ]
      };
      console.log('Bouton de confirmation créé:', JSON.stringify(keyboard));
      
      await telegramBot.sendMessage(
        chatId,
        `Récapitulatif de votre commande :\n` +
        `Événement : ${session.event.name}\n` +
        `Catégorie : ${session.category.name}\n` +
        `Quantité : ${quantity}\n` +
        `Prix unitaire : ${session.category.price} GNF\n` +
        `Prix total : ${session.totalPrice} GNF\n\n` +
        `Veuillez confirmer votre achat :`,
        { reply_markup: keyboard }
      );
    }
    
    // Confirmation de l'achat
    else if (data === 'confirm_purchase') {
      console.log('=== DÉBUT PROCESSUS DE CONFIRMATION D\'ACHAT ===');
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        console.log('ERREUR: Session non trouvée pour l\'utilisateur', userId);
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      const session = paymentSessions.get(userId);
      console.log('Session active trouvée:', JSON.stringify(session));
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
        reference: reference
      };
      
      console.log('Données de paiement prêtes:', JSON.stringify(paymentData));
      await telegramBot.sendMessage(chatId, 'Génération du lien de paiement en cours...');
      
      try {
        console.log('Appel au service chapchapPay.generatePaymentLink...');
        const paymentResponse = await chapchapPay.generatePaymentLink(paymentData);
        console.log('Réponse de ChapChap Pay:', JSON.stringify(paymentResponse));
        
        // Stocker les informations de paiement dans la session
        session.paymentUrl = paymentResponse.payment_url;
        session.step = 'payment_pending';
        paymentSessions.set(userId, session);
        
        // Envoyer le lien de paiement
        const keyboard = {
          inline_keyboard: [
            [{
              text: 'Payer maintenant',
              url: paymentResponse.payment_url
            }],
            [{
              text: 'Vérifier le paiement',
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
          `Votre lien de paiement est prêt !\n` +
          `Montant : ${paymentResponse.payment_amount_formatted}\n` +
          `Référence : ${reference}\n\n` +
          `Cliquez sur le bouton ci-dessous pour procéder au paiement. Une fois le paiement effectué, cliquez sur "Vérifier le paiement" pour générer vos tickets.`,
          { reply_markup: keyboard }
        );
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
      
      // Vérifier si l'utilisateur a une session active
      if (!paymentSessions.has(userId)) {
        console.log('ERREUR: Session non trouvée pour l\'utilisateur', userId);
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      const session = paymentSessions.get(userId);
      console.log('Session active trouvée:', JSON.stringify(session));
      
      // Vérifier que la référence correspond à celle de la session
      if (session.reference !== reference) {
        console.log('ERREUR: Référence de paiement ne correspond pas:', session.reference, '!=', reference);
        return telegramBot.sendMessage(chatId, 'Référence de paiement invalide. Veuillez réessayer.');
      }
      
      await telegramBot.sendMessage(chatId, 'Vérification du statut de votre paiement...');
      
      try {
        console.log('Appel au service chapchapPay.checkPaymentStatus avec référence:', reference);
        // Vérifier le statut du paiement
        const paymentStatus = await chapchapPay.checkPaymentStatus(reference);
        console.log('Réponse du statut de paiement:', JSON.stringify(paymentStatus));
        const Database = require('better-sqlite3');
        const db = new Database(__dirname + '/data.sqlite');
        
        if (paymentStatus.status === 'success') {
          // Paiement réussi, procéder à la création des tickets
          await telegramBot.sendMessage(chatId, 'Paiement confirmé ! Génération de vos tickets en cours...');
          
          // Créer la réservation dans la base de données
          const username = callbackQuery.from.username || '';
          const fullName = callbackQuery.from.first_name + ' ' + (callbackQuery.from.last_name || '');
          
          // Insérer la réservation
          const insertResult = db.prepare(`
            INSERT INTO reservations 
            (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            chapchapPay.generateTransactionId()
          );
          
          // Mettre à jour le nombre de places disponibles
          try {
            const updatedEventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(session.event.id);
            if (updatedEventInfo && typeof updatedEventInfo.available_seats === 'number') {
              const newAvailableSeats = Math.max(0, updatedEventInfo.available_seats - session.quantity);
              db.prepare('UPDATE events SET available_seats = ? WHERE id = ?').run(newAvailableSeats, session.event.id);
            }
          } catch (updateError) {
            console.error('Erreur lors de la mise à jour des places disponibles:', updateError);
          }
          
          // Générer les tickets supplémentaires si nécessaire
          if (session.quantity > 1) {
            // Vérifier si la table additional_tickets existe
            const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='additional_tickets'").get();
            
            if (!tableExists) {
              // Créer la table si elle n'existe pas
              db.prepare(`
                CREATE TABLE additional_tickets (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  reservation_id INTEGER,
                  formatted_id TEXT,
                  qr_code TEXT,
                  ticket_number INTEGER,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
                )
              `).run();
            }
            
            // Générer les tickets supplémentaires
            for (let i = 1; i < session.quantity; i++) {
              db.prepare(`
                INSERT INTO additional_tickets (reservation_id, formatted_id, qr_code, ticket_number)
                VALUES (?, ?, ?, ?)
              `).run(
                insertResult.lastInsertRowid,
                `${reference}-${i+1}`,
                chapchapPay.generateTransactionId(),
                i+1
              );
            }
          }
          
          // Générer et envoyer le ticket principal
          const generateAndSendTicket = require('./index').generateAndSendTicket;
          
          generateAndSendTicket({
            to: chatId,
            channel: 'telegram',
            eventName: session.event.name,
            category: session.category.name,
            reservationId: insertResult.lastInsertRowid,
            price: session.category.price,
            formattedId: reference,
            qrCode: reference
          });
          
          // Envoyer un message de confirmation
          await telegramBot.sendMessage(
            chatId,
            `Vos tickets ont été générés avec succès !\n` +
            `Référence de réservation : ${reference}\n` +
            `Vous pouvez les consulter et les télécharger en utilisant la commande /mestickets`
          );
          
          // Nettoyer la session
          paymentSessions.delete(userId);
          
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
        console.error('Erreur lors de la vérification du paiement :', error);
        telegramBot.sendMessage(chatId, 'Une erreur est survenue lors de la vérification du paiement. Veuillez réessayer plus tard.');
      }
    }
    
    // Annulation de l'achat
    else if (data === 'cancel_purchase') {
      // Supprimer la session de paiement
      paymentSessions.delete(userId);
      
      await telegramBot.sendMessage(chatId, 'Votre commande a été annulée. Vous pouvez démarrer un nouvel achat avec la commande /acheter');
    }
    
  } catch (error) {
    console.error('Erreur lors du traitement du callback :', error);
    telegramBot.sendMessage(chatId, 'Une erreur est survenue. Veuillez réessayer plus tard.');
  }
});

module.exports = telegramBot;
