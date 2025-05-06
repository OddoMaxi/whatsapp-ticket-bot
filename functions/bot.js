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
        console.log('ERREUR: Session non trouvée pour l\'utilisateur', userId);
        return telegramBot.sendMessage(chatId, 'Votre session a expiré. Veuillez recommencer l\'achat.');
      }
      
      // Mettre à jour la session avec la quantité sélectionnée
      const session = paymentSessions.get(userId);
      session.quantity = quantity;
      session.step = 'payment_creation';
      session.totalPrice = session.category.price * quantity;
      paymentSessions.set(userId, session);
      
      // Afficher le récapitulatif et demander confirmation avec un bouton "Oui, confirmer"
      const confirmKeyboard = {
        inline_keyboard: [
          [{
            text: 'Oui, confirmer',
            callback_data: 'confirm_purchase'
          }],
          [{
            text: 'Annuler',
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
        console.log('Référence générée:', reference);
      
        // Générer le lien de paiement
        const paymentData = {
          amount: session.totalPrice,
          description: `Achat de ${session.quantity} ticket(s) pour ${session.event.name} - ${session.category.name}`,
          reference: reference
        };
      
        console.log('Données de paiement prêtes:', JSON.stringify(paymentData));
        await telegramBot.sendMessage(chatId, 'Génération du lien de paiement en cours...');
      
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
              text: '💳 Payer maintenant',
              url: paymentResponse.payment_url
            }],
            [{
              text: '🔄 Vérifier le paiement',
              callback_data: `check_payment:${reference}`
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
          `❕ Après paiement, cliquez sur "Vérifier le paiement" pour générer vos tickets.`,
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

      // Empêcher toute génération de ticket si la session n'est pas en attente de paiement
      if (session.step !== 'payment_pending') {
        console.log('Tentative de génération de ticket sans étape payment_pending. Session:', JSON.stringify(session));
        return telegramBot.sendMessage(chatId, "Vous devez d'abord effectuer le paiement avant de recevoir vos tickets.");
      }

      await telegramBot.sendMessage(chatId, 'Vérification du statut de votre paiement...');

      try {
        console.log('Appel au service chapchapPay.checkPaymentStatus avec référence:', reference);
        // Vérifier le statut du paiement
        const paymentStatus = await chapchapPay.checkPaymentStatus(reference);
        console.log('Réponse du statut de paiement:', JSON.stringify(paymentStatus));
        
        // Initier la connexion à la base de données
        const Database = require('better-sqlite3');
        const db = new Database(__dirname + '/data.sqlite');
        console.log('Connexion à la base de données établie');
        
        // Vérifier que le paiement est validé avant de générer les tickets
        if (paymentStatus.status !== 'success' && paymentStatus.status !== 'completed' && paymentStatus.status !== 'paid') {
          // Paiement non validé
          await telegramBot.sendMessage(
            chatId,
            `Votre paiement est en cours de traitement.\n` +
            `Statut actuel : ${paymentStatus.status_description || paymentStatus.status}\n` +
            `Veuillez réessayer dans quelques instants.`
          );
          return;
        }
        
        // Mettre à jour l'état de la session pour éviter tout double envoi
        session.step = 'paid';
        paymentSessions.set(userId, session);
        console.log('Paiement confirmé avec le statut:', paymentStatus.status);
        
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
          
          // Ajouter un identifiant de groupe pour cette réservation (pour lier tous les tickets ensemble)
          const groupId = chapchapPay.generateTransactionId();
          console.log(`[Bot] ID de groupe généré pour la réservation : ${groupId}`);
          
          // Générer les tickets supplémentaires directement dans la table reservations
          if (session.quantity > 1) {
            // Générer les tickets supplémentaires dans la même table que le ticket principal
            for (let i = 1; i < session.quantity; i++) {
              // Générer un nouveau code QR unique pour chaque ticket supplémentaire
              const additionalQRCode = chapchapPay.generateQRCode();
              console.log(`[Bot] Nouveau QR code généré pour le ticket supplémentaire #${i+1} : ${additionalQRCode}`);
              
              // Insérer chaque ticket supplémentaire comme une entrée complète dans la table reservations
              try {
                const insertAdditionalResult = db.prepare(`
                  INSERT INTO reservations 
                  (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, parent_reference, ticket_number, date)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  fullName,
                  username,
                  session.event.id,
                  session.event.name,
                  session.category.name,
                  1, // Quantité toujours 1 car c'est un ticket individuel
                  session.category.price,
                  session.category.price, // Prix total = prix unitaire pour un seul ticket
                  'telegram',
                  `${reference}-${i+1}`, // ID formaté unique pour ce ticket
                  additionalQRCode, // QR code unique à 7 chiffres pour ce ticket
                  reference, // Référence au ticket principal
                  i+1, // Numéro de ticket dans le groupe
                  currentDate
                );
                console.log(`[Bot] Ticket supplémentaire #${i+1} inséré avec succès:`, insertAdditionalResult.lastInsertRowid);
              } catch (additionalTicketError) {
                console.error(`[Bot] Erreur lors de l'insertion du ticket supplémentaire #${i+1}:`, additionalTicketError);
              }
            }
          }
          
          // Générer et envoyer le ticket principal
          const generateAndSendTicket = require('./index').generateAndSendTicket;

          // LOG: trace d'appel de la génération du ticket principal
          console.log('DEBUG: Tentative de génération du ticket principal', {
            session,
            insertResult,
            reference,
            paymentStatus
          });

          // Vérification supplémentaire pour éviter le double envoi
          if (session.step === 'paid') {
            console.log('DEBUG: Envoi effectif du ticket principal à l\'utilisateur', {
              chatId,
              reservationId: insertResult.lastInsertRowid,
              reference
            });
            
            // Générer et envoyer le ticket principal
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
            
            // Générer et envoyer les tickets supplémentaires, si applicable
            if (session.quantity > 1) {
              try {
                // Récupérer les tickets supplémentaires de la base de données
                const additionalTickets = db.prepare(`
                  SELECT * FROM additional_tickets WHERE reservation_id = ? ORDER BY ticket_number
                `).all(insertResult.lastInsertRowid);
                
                console.log(`DEBUG: Génération de ${additionalTickets.length} tickets supplémentaires`);
                
                // Générer et envoyer chaque ticket supplémentaire
                for (const ticket of additionalTickets) {
                  console.log(`DEBUG: Envoi du ticket supplémentaire n°${ticket.ticket_number}`, ticket);
                  
                  generateAndSendTicket({
                    to: chatId,
                    channel: 'telegram',
                    eventName: session.event.name,
                    category: session.category.name,
                    reservationId: insertResult.lastInsertRowid,
                    price: session.category.price,
                    formattedId: ticket.formatted_id,
                    qrCode: ticket.qr_code
                  });
                  
                  // Petite pause entre chaque envoi pour éviter les limitations API
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (additionalTicketError) {
                console.error('Erreur lors de la génération des tickets supplémentaires:', additionalTicketError);
              }
            }

            // Envoyer un message de confirmation
            await telegramBot.sendMessage(
              chatId,
              `Vos tickets ont été générés avec succès !\n` +
              `Référence de réservation : ${reference}\n` +
              `Nombre de tickets : ${session.quantity}\n` +
              `Vous pouvez les consulter et les télécharger en utilisant la commande /mestickets`
            );

            // Nettoyer la session
            paymentSessions.delete(userId);
          } else {
            // Si on arrive ici, il y a un problème d'état
            console.log('DEBUG: Blocage génération ticket - état session incorrect', { session });
            await telegramBot.sendMessage(chatId, 'Erreur de synchronisation de paiement. Veuillez contacter le support.');
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
