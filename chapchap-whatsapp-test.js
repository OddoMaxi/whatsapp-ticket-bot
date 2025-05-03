/**
 * Fichier de test pour l'intégration de ChapChap Pay avec WhatsApp
 * Ce code montre comment intégrer le paiement avant la génération des tickets
 */

// Structure proposée pour le gestionnaire de messages WhatsApp
function processMessage(userMessage, from, userStates) {
  const state = userStates[from] || { step: 'init' };
  let response = '';

  // Exemple de code à intégrer dans votre gestionnaire de messages (index.js)
  // Ce code s'insère dans la condition qui traite la réponse "oui" pour la confirmation
  if (state.step === 'confirm' && /^oui$/i.test(userMessage)) {
    try {
      // 1. Importer le service ChapChap Pay
      const chapchapPay = require('./services/chapchap-pay');
      
      // 2. Récupérer les informations de l'événement et de la catégorie
      const Database = require('better-sqlite3');
      const db = new Database(__dirname + '/data.sqlite');
      
      const event = db.prepare('SELECT * FROM events WHERE id=?').get(state.event.id);
      
      if (!event) {
        return { 
          response: 'Erreur : événement introuvable.', 
          newState: { step: 'init' } 
        };
      }
      
      let cats = JSON.parse(event.categories);
      let catIdx = cats.findIndex(c => c.name === state.category.name);
      let cat = cats[catIdx];
      
      if (!cat) {
        return { 
          response: 'Erreur : catégorie introuvable.', 
          newState: { step: 'init' } 
        };
      }
      
      if ((cat.quantite || cat.quantity) < state.quantity) {
        return { 
          response: `Désolé, il ne reste que ${cat.quantite || cat.quantity} places pour cette catégorie.`,
          // On reste à l'étape de quantité
          newState: state 
        };
      }
      
      // 3. Générer une référence unique pour ce paiement
      const prix = cat.prix || cat.price;
      const totalPrice = prix * state.quantity;
      const reference = chapchapPay.generateTransactionId();
      
      // 4. Préparer les données de paiement
      const paymentData = {
        amount: totalPrice,
        description: `Achat de ${state.quantity} ticket(s) pour ${event.name} - ${cat.name}`,
        reference: reference
      };
      
      console.log('Données de paiement:', JSON.stringify(paymentData));
      
      // 5. Mettre à jour l'état de l'utilisateur
      const newState = {
        ...state,
        step: 'payment_pending',
        paymentReference: reference,
        totalPrice: totalPrice,
        paymentCreatedAt: Date.now()
      };
      
      // 6. Générer le lien de paiement (asynchrone)
      chapchapPay.generatePaymentLink(paymentData)
        .then(paymentResponse => {
          console.log('Réponse ChapChap Pay:', JSON.stringify(paymentResponse));
          
          // Stocker l'URL de paiement dans l'état de l'utilisateur
          userStates[from] = {
            ...newState,
            paymentUrl: paymentResponse.payment_url
          };
          
          // Envoyer le lien de paiement à l'utilisateur
          sendMessage(from, 
            `💸 Votre lien de paiement est prêt !\n\n` +
            `💰 Montant : ${paymentResponse.payment_amount_formatted}\n` +
            `🆔 Référence : ${reference}\n\n` +
            `⭐ Cliquez sur ce lien pour procéder au paiement :\n${paymentResponse.payment_url}\n\n` +
            `❕ Après avoir effectué le paiement, envoyez "VERIFY" pour vérifier votre paiement et générer vos tickets.`
          );
        })
        .catch(error => {
          console.error('Erreur lors de la génération du lien de paiement:', error);
          sendMessage(from, 'Une erreur est survenue lors de la génération du lien de paiement. Veuillez réessayer plus tard.');
          userStates[from] = { step: 'init' };
        });
      
      // 7. Réponse immédiate en attendant l'API
      return {
        response: 'Génération de votre lien de paiement en cours... Veuillez patienter quelques instants.',
        newState: newState
      };
    } catch (error) {
      console.error('Erreur dans le processus de paiement:', error);
      return {
        response: 'Une erreur est survenue. Veuillez réessayer plus tard.',
        newState: { step: 'init' }
      };
    }
  }
  
  // Gestion de la vérification du paiement
  else if (state.step === 'payment_pending' && /^verify$/i.test(userMessage)) {
    try {
      // Importer le service ChapChap Pay
      const chapchapPay = require('./services/chapchap-pay');
      
      if (!state.paymentReference) {
        return {
          response: 'Aucune référence de paiement trouvée. Veuillez recommencer l\'achat.',
          newState: { step: 'init' }
        };
      }
      
      // Message immédiat (la vérification se fera en asynchrone)
      const immediateResponse = 'Vérification de votre paiement en cours... Veuillez patienter quelques instants.';
      
      // Vérifier le statut du paiement (asynchrone)
      chapchapPay.checkPaymentStatus(state.paymentReference)
        .then(paymentStatus => {
          console.log('Statut de paiement:', JSON.stringify(paymentStatus));
          
          if (paymentStatus.status === 'completed' || paymentStatus.status === 'paid') {
            // Paiement réussi, procéder à la génération des tickets
            processSuccessfulPayment(from, state, paymentStatus);
          } else {
            // Paiement non réussi ou en attente
            sendMessage(from, 
              `Le paiement n'est pas encore confirmé. Statut actuel: ${paymentStatus.status}.\n` +
              `Veuillez finaliser votre paiement puis envoyer "VERIFY" pour vérifier à nouveau.`
            );
          }
        })
        .catch(error => {
          console.error('Erreur lors de la vérification du statut de paiement:', error);
          sendMessage(from, 
            'Une erreur est survenue lors de la vérification de votre paiement. ' +
            'Veuillez réessayer plus tard en envoyant "VERIFY".'
          );
        });
      
      // Réponse immédiate pendant que le processus asynchrone se déroule
      return {
        response: immediateResponse,
        newState: state // Garder le même état, car on attend la confirmation
      };
    } catch (error) {
      console.error('Erreur dans le processus de vérification de paiement:', error);
      return {
        response: 'Une erreur est survenue. Veuillez réessayer plus tard.',
        newState: state // Conserver l'état payment_pending pour permettre une nouvelle tentative
      };
    }
  }
  
  // Autres étapes de votre chatbot...
  return { response, newState: state };
}

/**
 * Cette fonction sera appelée uniquement si le paiement est confirmé
 * Elle génère les tickets et met à jour le stock
 */
async function processSuccessfulPayment(from, state, paymentStatus) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(__dirname + '/data.sqlite');
    
    // Récupérer les informations de l'événement et de la catégorie
    const event = db.prepare('SELECT * FROM events WHERE id=?').get(state.event.id);
    let cats = JSON.parse(event.categories);
    let catIdx = cats.findIndex(c => c.name === state.category.name);
    let cat = cats[catIdx];
    
    // Envoyer un message de confirmation
    sendMessage(from, 'Paiement confirmé ! Génération de vos tickets en cours...');
    
    // Décrémenter le stock maintenant que le paiement est confirmé
    cat.quantite = (cat.quantite || cat.quantity) - state.quantity;
    cats[catIdx] = cat;
    db.prepare('UPDATE events SET categories=? WHERE id=?').run(JSON.stringify(cats), event.id);
    
    // Générer un ticket pour chaque place achetée
    const prix = cat.prix || cat.price;
    generateTickets(from, state, event, cat, prix);
    
    // Mettre à jour l'état de l'utilisateur
    userStates[from] = { step: 'init' };
    
    // Envoyer un message final
    sendMessage(from, 
      `Merci ! Votre réservation de ${state.quantity} ticket(s) pour "${event.name}" en catégorie "${cat.name}" est confirmée.\n` +
      `Vos tickets vous sont envoyés par WhatsApp.\n` +
      `Tapez "menu" pour recommencer.`
    );
  } catch (error) {
    console.error('Erreur lors du traitement du paiement réussi:', error);
    sendMessage(from, 'Une erreur est survenue lors de la génération de vos tickets. Veuillez contacter le support.');
    userStates[from] = { step: 'init' };
  }
}

/**
 * Génère les tickets pour l'utilisateur
 */
function generateTickets(from, state, event, cat, prix) {
  // Variables pour la génération de ticket
  const QR_CODE_LENGTH = 7;
  
  for (let i = 0; i < state.quantity; i++) {
    try {
      // Chaque ticket a sa propre réservation (quantity = 1)
      const rsvInfo = db.prepare(`
        INSERT INTO reservations (
          user, phone, event_id, event_name, category_name, 
          quantity, unit_price, total_price, date, payment_reference, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
      `).run(
        from, from, event.id, event.name, cat.name, 
        1, prix, prix, state.paymentReference, 'paid'
      );

      // Calculer le numéro de ticket séquentiel pour cet event/cat
      const previousTickets = db.prepare('SELECT COUNT(*) as count FROM reservations WHERE event_id=? AND category_name=?').get(event.id, cat.name);
      const ticketNum = (previousTickets.count || 0) + 1;

      // Générer l'ID formaté
      let categoriesArr = event.categories;
      if (typeof categoriesArr === 'string') {
        try {
          categoriesArr = JSON.parse(categoriesArr);
        } catch (e) {
          console.error('Erreur de parsing event.categories:', event.categories, e);
          categoriesArr = [];
        }
      }
      const catIdxForId = Array.isArray(categoriesArr) ? categoriesArr.findIndex(c => c.name === cat.name) : -1;
      const formattedId = formatReservationId(event.id, catIdxForId, ticketNum);

      // Générer un code QR unique
      let qrCode;
      let maxAttempts = 10;
      let attempts = 0;
      do {
        qrCode = String(Math.floor(Math.pow(10, QR_CODE_LENGTH - 1) + Math.random() * (Math.pow(10, QR_CODE_LENGTH) - Math.pow(10, QR_CODE_LENGTH - 1))));
        attempts++;
        if (attempts > maxAttempts) {
          console.error('Impossible de générer un QR code unique après plusieurs tentatives.');
          break;
        }
      } while (db.prepare('SELECT 1 FROM reservations WHERE qr_code = ?').get(qrCode));

      // Mettre à jour la réservation avec les codes générés
      try {
        // Vérifier si la colonne code existe avant de l'utiliser
        const columnInfo = db.prepare("PRAGMA table_info(reservations)").all();
        const codeColumnExists = columnInfo.some(col => col.name === 'code');
        
        if (codeColumnExists) {
          db.prepare('UPDATE reservations SET formatted_id=?, qr_code=?, code=? WHERE id=?').run(formattedId, qrCode, formattedId, rsvInfo.lastInsertRowid);
        } else {
          db.prepare('UPDATE reservations SET formatted_id=?, qr_code=? WHERE id=?').run(formattedId, qrCode, rsvInfo.lastInsertRowid);
        }
      } catch (err) {
        console.error("Erreur lors de la mise à jour de la réservation:", err);
        // Fallback en cas d'erreur
        db.prepare('UPDATE reservations SET formatted_id=?, qr_code=? WHERE id=?').run(formattedId, qrCode, rsvInfo.lastInsertRowid);
      }

      // Générer et envoyer le ticket
      setTimeout(() => {
        try {
          generateAndSendTicket({
            to: from,
            eventName: event.name,
            category: cat.name,
            reservationId: rsvInfo.lastInsertRowid,
            formattedId,
            qrCode
          });
        } catch (err) {
          console.error('Erreur lors de l\'appel à generateAndSendTicket (WhatsApp):', {
            catIdx: catIdxForId, formattedId, qrCode, from, eventName: event.name, category: cat.name, reservationId: rsvInfo.lastInsertRowid, err
          });
        }
      }, 0);
    } catch (err) {
      console.error('Erreur lors de la génération du ticket (WhatsApp, boucle):', err);
    }
  }
}

// Fonction fictive pour envoyer un message (à remplacer par votre implémentation réelle)
function sendMessage(to, message) {
  console.log(`Envoi d'un message à ${to}:`, message);
  // Votre code d'envoi de message WhatsApp ici
}

// Export des fonctions pour utilisation dans le code principal
module.exports = {
  processMessage,
  processSuccessfulPayment
};
