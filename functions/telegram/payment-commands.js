/**
 * Commandes Telegram pour gérer les paiements via ChapChap Pay
 */
const { Markup } = require('telegraf');
const db = require('better-sqlite3')('database.db');
const chapchapPay = require('../services/chapchap-pay');

// Stocker les sessions de paiement temporaires
const paymentSessions = new Map();

/**
 * Initialise le processus d'achat de tickets
 */
async function handleBuyTickets(ctx) {
  try {
    // Vérifier si l'utilisateur a déjà une session de paiement en cours
    const userId = ctx.from.id;
    if (paymentSessions.has(userId)) {
      return ctx.reply('Vous avez déjà une session d\'achat en cours. Veuillez la terminer ou l\'annuler avant d\'en démarrer une nouvelle.');
    }

    // Récupérer les événements disponibles
    const events = db.prepare(`
      SELECT * FROM events 
      WHERE active = 1 
      ORDER BY date
    `).all();

    if (!events || events.length === 0) {
      return ctx.reply('Aucun événement disponible pour le moment.');
    }

    // Créer les boutons pour les événements
    const eventButtons = events.map(event => {
      return [Markup.button.callback(event.name, `select_event:${event.id}`)];
    });

    // Ajouter un bouton d'annulation
    eventButtons.push([Markup.button.callback('Annuler', 'cancel_purchase')]);

    await ctx.reply(
      'Veuillez sélectionner un événement :',
      Markup.inlineKeyboard(eventButtons)
    );

    // Initialiser une session de paiement
    paymentSessions.set(userId, { step: 'select_event' });

  } catch (error) {
    console.error('Erreur lors de l\'initialisation de l\'achat :', error);
    ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

/**
 * Gère la sélection d'un événement
 */
async function handleEventSelection(ctx) {
  try {
    const userId = ctx.from.id;
    const eventId = ctx.match[1];

    // Vérifier si l'utilisateur a une session active
    if (!paymentSessions.has(userId)) {
      return ctx.reply('Votre session a expiré. Veuillez recommencer l\'achat.');
    }

    // Récupérer les informations de l'événement
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event) {
      return ctx.reply('Événement non trouvé. Veuillez réessayer.');
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
    const categoryButtons = categories.map(category => {
      const price = category.price || category.prix || 0;
      return [Markup.button.callback(
        `${category.name} - ${price} GNF`, 
        `select_category:${category.name}:${price}`
      )];
    });

    // Ajouter un bouton d'annulation
    categoryButtons.push([Markup.button.callback('Annuler', 'cancel_purchase')]);

    await ctx.reply(
      `Vous avez sélectionné : ${event.name}\nVeuillez choisir une catégorie :`,
      Markup.inlineKeyboard(categoryButtons)
    );

  } catch (error) {
    console.error('Erreur lors de la sélection de l\'événement :', error);
    ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

/**
 * Gère la sélection d'une catégorie
 */
async function handleCategorySelection(ctx) {
  try {
    const userId = ctx.from.id;
    const [categoryName, price] = [ctx.match[1], parseInt(ctx.match[2])];

    // Vérifier si l'utilisateur a une session active
    if (!paymentSessions.has(userId)) {
      return ctx.reply('Votre session a expiré. Veuillez recommencer l\'achat.');
    }

    // Mettre à jour la session avec la catégorie sélectionnée
    const session = paymentSessions.get(userId);
    session.category = { name: categoryName, price: price };
    session.step = 'select_quantity';
    paymentSessions.set(userId, session);

    // Créer les boutons pour les quantités
    const quantityButtons = [
      [1, 2, 3].map(qty => Markup.button.callback(`${qty}`, `select_quantity:${qty}`)),
      [4, 5, 6].map(qty => Markup.button.callback(`${qty}`, `select_quantity:${qty}`)),
      [Markup.button.callback('Annuler', 'cancel_purchase')]
    ];

    await ctx.reply(
      `Catégorie sélectionnée : ${categoryName} - ${price} GNF\nVeuillez choisir la quantité :`,
      Markup.inlineKeyboard(quantityButtons)
    );

  } catch (error) {
    console.error('Erreur lors de la sélection de la catégorie :', error);
    ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

/**
 * Gère la sélection de la quantité
 */
async function handleQuantitySelection(ctx) {
  try {
    const userId = ctx.from.id;
    const quantity = parseInt(ctx.match[1]);

    // Vérifier si l'utilisateur a une session active
    if (!paymentSessions.has(userId)) {
      return ctx.reply('Votre session a expiré. Veuillez recommencer l\'achat.');
    }

    // Mettre à jour la session avec la quantité sélectionnée
    const session = paymentSessions.get(userId);
    session.quantity = quantity;
    session.step = 'confirm_purchase';
    session.totalPrice = session.category.price * quantity;
    paymentSessions.set(userId, session);

    // Demander confirmation
    const confirmButtons = [
      [
        Markup.button.callback('Confirmer et payer', 'confirm_purchase'),
        Markup.button.callback('Annuler', 'cancel_purchase')
      ]
    ];

    await ctx.reply(
      `Récapitulatif de votre commande :\n` +
      `Événement : ${session.event.name}\n` +
      `Catégorie : ${session.category.name}\n` +
      `Quantité : ${quantity}\n` +
      `Prix unitaire : ${session.category.price} GNF\n` +
      `Prix total : ${session.totalPrice} GNF\n\n` +
      `Veuillez confirmer votre achat :`,
      Markup.inlineKeyboard(confirmButtons)
    );

  } catch (error) {
    console.error('Erreur lors de la sélection de la quantité :', error);
    ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

/**
 * Confirme l'achat et génère un lien de paiement
 */
async function handleConfirmPurchase(ctx) {
  try {
    const userId = ctx.from.id;

    // Vérifier si l'utilisateur a une session active
    if (!paymentSessions.has(userId)) {
      return ctx.reply('Votre session a expiré. Veuillez recommencer l\'achat.');
    }

    const session = paymentSessions.get(userId);
    
    // Vérifier la disponibilité des places
    const eventInfo = db.prepare('SELECT available_seats FROM events WHERE id = ?').get(session.event.id);
    if (eventInfo && typeof eventInfo.available_seats === 'number' && eventInfo.available_seats < session.quantity) {
      return ctx.reply(`Désolé, il ne reste que ${eventInfo.available_seats} place(s) disponible(s) pour cet événement.`);
    }

    // Générer une référence unique pour ce paiement
    const reference = chapchapPay.generateTransactionId();
    session.reference = reference;
    
    // Générer le lien de paiement
    const paymentData = {
      amount: session.totalPrice,
      description: `Achat de ${session.quantity} ticket(s) pour ${session.event.name} - ${session.category.name}`,
      reference: reference,
      // Vous pouvez ajouter un callbackUrl si vous avez un webhook pour recevoir les notifications de paiement
    };

    await ctx.reply('Génération du lien de paiement en cours...');

    const paymentResponse = await chapchapPay.generatePaymentLink(paymentData);
    
    // Stocker les informations de paiement dans la session
    session.paymentUrl = paymentResponse.payment_url;
    session.step = 'payment_pending';
    paymentSessions.set(userId, session);

    // Envoyer le lien de paiement
    const paymentButtons = [
      [Markup.button.url('Payer maintenant', paymentResponse.payment_url)],
      [Markup.button.callback('Vérifier le paiement', `check_payment:${reference}`)],
      [Markup.button.callback('Annuler', 'cancel_purchase')]
    ];

    await ctx.reply(
      `Votre lien de paiement est prêt !\n` +
      `Montant : ${paymentResponse.payment_amount_formatted}\n` +
      `Référence : ${reference}\n\n` +
      `Cliquez sur le bouton ci-dessous pour procéder au paiement. Une fois le paiement effectué, cliquez sur "Vérifier le paiement" pour générer vos tickets.`,
      Markup.inlineKeyboard(paymentButtons)
    );

  } catch (error) {
    console.error('Erreur lors de la confirmation de l\'achat :', error);
    ctx.reply('Une erreur est survenue lors de la génération du lien de paiement. Veuillez réessayer plus tard.');
  }
}

/**
 * Vérifie le statut du paiement
 */
async function handleCheckPayment(ctx) {
  try {
    const userId = ctx.from.id;
    const reference = ctx.match[1];

    // Vérifier si l'utilisateur a une session active
    if (!paymentSessions.has(userId)) {
      return ctx.reply('Votre session a expiré. Veuillez recommencer l\'achat.');
    }

    const session = paymentSessions.get(userId);
    
    // Vérifier que la référence correspond à celle de la session
    if (session.reference !== reference) {
      return ctx.reply('Référence de paiement invalide. Veuillez réessayer.');
    }

    await ctx.reply('Vérification du statut de votre paiement...');

    // Vérifier le statut du paiement
    const paymentStatus = await chapchapPay.checkPaymentStatus(reference);
    
    if (paymentStatus.status === 'success') {
      // Paiement réussi, procéder à la création des tickets
      await ctx.reply('Paiement confirmé ! Génération de vos tickets en cours...');
      
      // Créer la réservation dans la base de données
      const reservationData = {
        user: ctx.from.first_name + ' ' + (ctx.from.last_name || ''),
        phone: ctx.from.username || '',
        event_id: session.event.id,
        event_name: session.event.name,
        category_name: session.category.name,
        quantity: session.quantity,
        unit_price: session.category.price,
        total_price: session.totalPrice,
        purchase_channel: 'telegram',
        payment_reference: reference,
        payment_method: paymentStatus.payment_method
      };
      
      // Insérer la réservation
      const insertResult = db.prepare(`
        INSERT INTO reservations 
        (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reservationData.user,
        reservationData.phone,
        reservationData.event_id,
        reservationData.event_name,
        reservationData.category_name,
        reservationData.quantity,
        reservationData.unit_price,
        reservationData.total_price,
        reservationData.purchase_channel,
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
      
      // Envoyer les tickets à l'utilisateur
      await ctx.reply(
        `Vos tickets ont été générés avec succès !\n` +
        `Référence de réservation : ${reference}\n` +
        `Vous pouvez les consulter et les télécharger en utilisant la commande /mes_tickets`
      );
      
      // Nettoyer la session
      paymentSessions.delete(userId);
      
    } else if (paymentStatus.status === 'pending') {
      // Paiement en attente
      await ctx.reply(
        `Votre paiement est en cours de traitement.\n` +
        `Statut actuel : ${paymentStatus.status_description}\n` +
        `Veuillez réessayer dans quelques instants.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Vérifier à nouveau', `check_payment:${reference}`)],
          [Markup.button.callback('Annuler', 'cancel_purchase')]
        ])
      );
    } else {
      // Paiement échoué ou autre statut
      await ctx.reply(
        `Votre paiement n'a pas été confirmé.\n` +
        `Statut : ${paymentStatus.status_description}\n` +
        `Erreur : ${paymentStatus.error_message || 'Aucune erreur spécifiée'}\n\n` +
        `Vous pouvez réessayer le paiement ou annuler votre commande.`,
        Markup.inlineKeyboard([
          [Markup.button.url('Réessayer le paiement', session.paymentUrl)],
          [Markup.button.callback('Vérifier à nouveau', `check_payment:${reference}`)],
          [Markup.button.callback('Annuler', 'cancel_purchase')]
        ])
      );
    }

  } catch (error) {
    console.error('Erreur lors de la vérification du paiement :', error);
    ctx.reply('Une erreur est survenue lors de la vérification du paiement. Veuillez réessayer plus tard.');
  }
}

/**
 * Annule le processus d'achat
 */
async function handleCancelPurchase(ctx) {
  try {
    const userId = ctx.from.id;
    
    // Supprimer la session de paiement
    paymentSessions.delete(userId);
    
    await ctx.reply('Votre commande a été annulée. Vous pouvez démarrer un nouvel achat avec la commande /acheter_tickets');
    
  } catch (error) {
    console.error('Erreur lors de l\'annulation de l\'achat :', error);
    ctx.reply('Une erreur est survenue. Veuillez réessayer plus tard.');
  }
}

// Exporter les gestionnaires de commandes
module.exports = {
  handleBuyTickets,
  handleEventSelection,
  handleCategorySelection,
  handleQuantitySelection,
  handleConfirmPurchase,
  handleCheckPayment,
  handleCancelPurchase
};
