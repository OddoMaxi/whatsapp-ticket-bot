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
      
      // Générer un code QR unique de 7 chiffres pour le ticket principal
      const qrCode = chapchapPay.generateQRCode();
      console.log(`[Telegram] Nouveau QR code généré pour le ticket principal : ${qrCode}`);
      
      // Ajouter la date actuelle pour la réservation
      const currentDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
      
      // Insérer la réservation avec le champ date
      const insertResult = db.prepare(`
        INSERT INTO reservations 
        (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        qrCode, // Code QR unique pour le ticket principal
        currentDate // Date de la réservation
      );
      
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
          console.log(`[Telegram] Nombre total de places mis à jour pour l'événement #${session.event.id}: ${event.available_seats} -> ${newAvailableSeats}`);
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
                console.log(`[Telegram] Quantité ('quantite') mise à jour pour ${cat.name}: ${qtyBefore} -> ${cat.quantite}`);
              } else if (cat.quantity !== undefined) {
                cat.quantity = Math.max(0, cat.quantity - session.quantity);
                console.log(`[Telegram] Quantité ('quantity') mise à jour pour ${cat.name}: ${qtyBefore} -> ${cat.quantity}`);
              }
              
              // Sauvegarder les catégories mises à jour
              const updateResult = db.prepare('UPDATE events SET categories = ? WHERE id = ?').run(JSON.stringify(categories), session.event.id);
              console.log(`[Telegram] Catégorie mise à jour pour l'événement #${session.event.id}:`, { updateResult });
            } else {
              console.error(`[Telegram] Catégorie ${session.category.name} introuvable dans l'événement #${session.event.id}`);
            }
          } catch (jsonError) {
            console.error('Erreur lors du traitement JSON des catégories:', jsonError);
          }
        } else {
          console.error(`[Telegram] Aucune catégorie trouvée pour l'événement #${session.event.id}`);
        }
      } catch (updateError) {
        console.error('Erreur lors de la mise à jour des places disponibles:', updateError);
      }
      
      // Débogage - afficher la session complète
      console.log('DEBUG: Session avant traitement:', JSON.stringify(session, null, 2));
      console.log('DEBUG: Quantité telle qu\'elle apparaît dans la session:', session.quantity, typeof session.quantity);
      
      // S'assurer que session.quantity est un nombre et qu'il est au moins 1
      if (session.quantity === undefined || session.quantity === null || isNaN(Number(session.quantity))) {
        console.log('DEBUG: Quantité non définie ou invalide dans la session. Réglage sur 1.');
        session.quantity = 1;
      } else {
        // Convertir explicitement en nombre pour éviter les problèmes de type
        session.quantity = Number(session.quantity);
        console.log('DEBUG: Quantité convertie en nombre:', session.quantity);
      }
      
      // Vérifier et ajouter les colonnes nécessaires à la table reservations si elles n'existent pas
      try {
        // Vérifier si les colonnes parent_reference et ticket_number existent
        const columns = db.prepare("PRAGMA table_info(reservations)").all();
        const hasParentReference = columns.some(col => col.name === 'parent_reference');
        const hasTicketNumber = columns.some(col => col.name === 'ticket_number');
        
        // Ajouter les colonnes manquantes si nécessaire
        if (!hasParentReference) {
          console.log('[Telegram] Ajout de la colonne parent_reference à la table reservations');
          db.prepare("ALTER TABLE reservations ADD COLUMN parent_reference TEXT").run();
        }
        
        if (!hasTicketNumber) {
          console.log('[Telegram] Ajout de la colonne ticket_number INTEGER à la table reservations');
          db.prepare("ALTER TABLE reservations ADD COLUMN ticket_number INTEGER").run();
        }
      } catch (schemaError) {
        console.error('[Telegram] Erreur lors de la vérification/modification du schéma:', schemaError);
      }
      
      // Ajouter un identifiant de groupe pour cette réservation (pour lier tous les tickets ensemble)
      const groupId = chapchapPay.generateTransactionId();
      console.log(`[Telegram] ID de groupe généré pour la réservation : ${groupId}`);
      
      // Générer les tickets supplémentaires directement dans la table reservations
      if (session.quantity > 1) {
        console.log(`[Telegram] Génération de ${session.quantity - 1} tickets supplémentaires`);
        
        // Générer les tickets supplémentaires dans la même table que le ticket principal
        for (let i = 1; i < session.quantity; i++) {
          try {
            // Générer un nouveau code QR unique pour chaque ticket supplémentaire
            const additionalQRCode = chapchapPay.generateQRCode();
            console.log(`[Telegram] Nouveau QR code généré pour le ticket supplémentaire #${i+1} : ${additionalQRCode}`);
            
            // Préparer la requête SQL en fonction des colonnes disponibles
            let sql = `
              INSERT INTO reservations 
              (user, phone, event_id, event_name, category_name, quantity, unit_price, total_price, purchase_channel, formatted_id, qr_code, date
            `;
            
            // Ajouter les colonnes optionnelles si elles existent
            sql += `, parent_reference, ticket_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
            // Insérer chaque ticket supplémentaire comme une entrée complète dans la table reservations
            const insertResult = db.prepare(sql).run(
              reservationData.user,
              reservationData.phone,
              reservationData.event_id,
              reservationData.event_name,
              reservationData.category_name,
              1, // Quantité toujours 1 car c'est un ticket individuel
              reservationData.unit_price,
              reservationData.unit_price, // Prix total = prix unitaire pour un seul ticket
              reservationData.purchase_channel,
              `${reference}-${i+1}`, // ID formaté unique pour ce ticket
              additionalQRCode, // QR code unique à 7 chiffres pour ce ticket
              currentDate,
              reference, // Référence au ticket principal
              i+1 // Numéro de ticket dans le groupe
            );
            
            console.log(`[Telegram] Ticket supplémentaire #${i+1} inséré avec succès. ID: ${insertResult.lastInsertRowid}`);
          } catch (ticketError) {
            console.error(`[Telegram] Erreur lors de l'insertion du ticket supplémentaire #${i+1}:`, ticketError);
          }
        }
      } else {
        console.log('[Telegram] Aucun ticket supplémentaire à générer (quantité = 1)');
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
