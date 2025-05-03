/**
 * Script de test pour l'API ChapChap Pay
 * 
 * Ce script teste directement les fonctions de génération de lien de paiement
 * et de vérification de statut sans passer par Telegram.
 */

// Charger les variables d'environnement
require('dotenv').config();

// Importer le service ChapChap Pay
const chapchapPay = require('./functions/services/chapchap-pay');

// Fonction pour tester la génération d'un lien de paiement
async function testGeneratePaymentLink() {
  console.log('=== TEST DE GÉNÉRATION DE LIEN DE PAIEMENT ===');
  
  try {
    // Créer des données de test pour le paiement
    const reference = chapchapPay.generateTransactionId();
    console.log('Référence générée:', reference);
    
    const paymentData = {
      amount: 5000,
      description: 'Test de paiement ChapChap Pay',
      reference: reference
    };
    
    console.log('Données de paiement:', paymentData);
    
    // Appeler la fonction de génération de lien
    console.log('Appel à generatePaymentLink...');
    const response = await chapchapPay.generatePaymentLink(paymentData);
    
    // Afficher la réponse complète
    console.log('Réponse complète:');
    console.log(response);
    
    // Afficher les détails importants
    console.log('\nDétails importants:');
    console.log('- Code:', response.code);
    console.log('- URL de paiement:', response.payment_url);
    console.log('- Montant formaté:', response.payment_amount_formatted);
    console.log('- Référence:', response.operation_reference);
    
    // Tester l'ouverture du lien dans un navigateur
    console.log('\nPour tester, ouvrez ce lien dans votre navigateur:');
    console.log(response.payment_url);
    
    // Stocker la référence pour le test de statut
    return reference;
  } catch (error) {
    console.error('ERREUR lors du test de génération de lien:');
    console.error(error);
    
    // Afficher les détails de l'erreur si disponibles
    if (error.response) {
      console.error('Détails de la réponse d\'erreur:');
      console.error('- Statut:', error.response.status);
      console.error('- Données:', error.response.data);
      console.error('- Headers:', error.response.headers);
    } else if (error.request) {
      console.error('La requête a été envoyée mais aucune réponse n\'a été reçue');
      console.error(error.request);
    } else {
      console.error('Erreur lors de la configuration de la requête:', error.message);
    }
    
    return null;
  }
}

// Fonction pour tester la vérification du statut d'un paiement
async function testCheckPaymentStatus(reference) {
  console.log('\n=== TEST DE VÉRIFICATION DE STATUT DE PAIEMENT ===');
  
  if (!reference) {
    console.log('Aucune référence fournie. Utilisation d\'une référence de test.');
    reference = '2505-ABCD1234'; // Remplacez par une référence valide si vous en avez une
  }
  
  console.log('Référence à vérifier:', reference);
  
  try {
    // Appeler la fonction de vérification de statut
    console.log('Appel à checkPaymentStatus...');
    const response = await chapchapPay.checkPaymentStatus(reference);
    
    // Afficher la réponse complète
    console.log('Réponse complète:');
    console.log(response);
    
    // Afficher les détails importants
    console.log('\nDétails importants:');
    console.log('- Code:', response.code);
    console.log('- Statut:', response.status);
    console.log('- Description du statut:', response.status_description);
    console.log('- Montant payé:', response.payment_amount);
    console.log('- Méthode de paiement:', response.payment_method);
    
    return response;
  } catch (error) {
    console.error('ERREUR lors du test de vérification de statut:');
    console.error(error);
    
    // Afficher les détails de l'erreur si disponibles
    if (error.response) {
      console.error('Détails de la réponse d\'erreur:');
      console.error('- Statut:', error.response.status);
      console.error('- Données:', error.response.data);
      console.error('- Headers:', error.response.headers);
    } else if (error.request) {
      console.error('La requête a été envoyée mais aucune réponse n\'a été reçue');
      console.error(error.request);
    } else {
      console.error('Erreur lors de la configuration de la requête:', error.message);
    }
    
    return null;
  }
}

// Fonction principale qui exécute les tests
async function runTests() {
  console.log('Démarrage des tests ChapChap Pay...');
  console.log('Date et heure:', new Date().toISOString());
  console.log('----------------------------------------------');
  
  // Tester la génération d'un ID de transaction
  const transactionId = chapchapPay.generateTransactionId();
  console.log('ID de transaction généré pour test:', transactionId);
  console.log('----------------------------------------------');
  
  // Test 1: Générer un lien de paiement
  const reference = await testGeneratePaymentLink();
  console.log('----------------------------------------------');
  
  // Demander à l'utilisateur d'effectuer le paiement
  console.log('\nVeuillez effectuer le paiement en utilisant le lien ci-dessus.');
  console.log('Après avoir effectué le paiement, exécutez la commande suivante pour vérifier le statut:');
  console.log(`node test-chapchap.js check ${reference}`);
  console.log('----------------------------------------------');
  
  // Test 2: Vérifier le statut si une référence est fournie en argument
  if (process.argv.length > 2 && process.argv[2] === 'check' && process.argv[3]) {
    await testCheckPaymentStatus(process.argv[3]);
    console.log('----------------------------------------------');
  } else if (reference) {
    console.log('\nTest de vérification de statut avec la référence générée:');
    await testCheckPaymentStatus(reference);
    console.log('----------------------------------------------');
  }
  
  console.log('\nTests terminés.');
}

// Exécuter les tests
runTests().catch(error => {
  console.error('Erreur globale dans les tests:', error);
});
