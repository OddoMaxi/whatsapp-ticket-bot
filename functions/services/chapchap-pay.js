/**
 * Service pour l'intégration de ChapChap Pay
 */
const axios = require('axios');
const crypto = require('crypto');

// Configuration ChapChap Pay
const CHAPCHAP_CONFIG = {
  eCommerceCode: 'MzcwNDU4MTE',
  createPaymentUrl: 'https://mapaycard.com/epay/create/',
  statusBaseUrl: 'https://mapaycard.com/epay/MzcwNDU4MTE/'
};

/**
 * Génère un identifiant unique pour une transaction
 * @returns {string} Identifiant de transaction au format "YYMMDD-XXXXXXXX"
 */
function generateTransactionId() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  // Générer une chaîne aléatoire de 8 caractères (lettres majuscules et chiffres)
  const randomPart = crypto.randomBytes(4)
    .toString('hex')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
  
  return `${year}${month}-${randomPart}`;
}

/**
 * Génère un lien de paiement ChapChap Pay
 * 
 * @param {Object} paymentData Données du paiement
 * @param {number} paymentData.amount Montant à payer
 * @param {string} paymentData.description Description du paiement
 * @param {string} paymentData.reference Référence unique du paiement (optionnel)
 * @param {string} paymentData.callbackUrl URL de callback après paiement (optionnel)
 * @param {string} paymentData.preferredMethod Méthode de paiement préférée (optionnel)
 * @returns {Promise<Object>} Réponse de l'API ChapChap Pay
 */
async function generatePaymentLink(paymentData) {
  try {
    // Générer une référence si non fournie
    const reference = paymentData.reference || generateTransactionId();
    
    // Préparer les données pour la requête
    const requestData = new URLSearchParams();
    requestData.append('c', CHAPCHAP_CONFIG.eCommerceCode);
    requestData.append('paycard-amount', paymentData.amount);
    requestData.append('paycard-description', paymentData.description || 'Achat de ticket');
    requestData.append('paycard-operation-reference', reference);
    
    // Ajouter les paramètres optionnels s'ils sont fournis
    if (paymentData.callbackUrl) {
      requestData.append('paycard-callback-url', paymentData.callbackUrl);
    }
    
    // Ajouter la redirection vers la méthode de paiement préférée si spécifiée
    if (paymentData.preferredMethod) {
      switch (paymentData.preferredMethod) {
        case 'paycard':
          requestData.append('paycard-jump-to-paycard', 'on');
          break;
        case 'cc':
          requestData.append('paycard-jump-to-cc', 'on');
          break;
        case 'orange_money':
          requestData.append('paycard-jump-to-om', 'on');
          break;
        case 'mtn_momo':
          requestData.append('paycard-jump-to-momo', 'on');
          break;
      }
    }
    
    // Faire la requête à l'API ChapChap Pay
    const response = await axios.post(CHAPCHAP_CONFIG.createPaymentUrl, requestData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Vérifier si la requête a réussi
    if (response.data && response.data.code === 0) {
      console.log('Lien de paiement généré avec succès:', response.data.payment_url);
      return response.data;
    } else {
      console.error('Erreur lors de la génération du lien de paiement:', response.data);
      throw new Error(response.data.error_message || 'Erreur lors de la génération du lien de paiement');
    }
  } catch (error) {
    console.error('Erreur lors de la génération du lien de paiement:', error);
    throw error;
  }
}

/**
 * Vérifie le statut d'un paiement
 * 
 * @param {string} operationReference Référence de l'opération
 * @returns {Promise<Object>} Statut du paiement
 */
async function checkPaymentStatus(operationReference) {
  try {
    const statusUrl = `${CHAPCHAP_CONFIG.statusBaseUrl}${operationReference}/status`;
    
    const response = await axios.get(statusUrl);
    
    if (response.data && response.data.code === 0) {
      console.log('Statut du paiement récupéré avec succès:', response.data.status);
      return response.data;
    } else {
      console.error('Erreur lors de la récupération du statut du paiement:', response.data);
      throw new Error(response.data.error_message || 'Erreur lors de la récupération du statut du paiement');
    }
  } catch (error) {
    console.error('Erreur lors de la récupération du statut du paiement:', error);
    throw error;
  }
}

module.exports = {
  generatePaymentLink,
  checkPaymentStatus,
  generateTransactionId
};
