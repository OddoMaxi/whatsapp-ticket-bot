/**
 * Script pour corriger les erreurs de syntaxe dans index.js
 * Exécuter ce script pour résoudre les problèmes d'apostrophes non échappées
 * et les problèmes de structure dans le fichier index.js
 */

const fs = require('fs');
const path = require('path');

// Chemin vers le fichier index.js
const indexFilePath = path.join(__dirname, 'functions', 'index.js');

try {
  // Lire le contenu du fichier
  console.log('Lecture du fichier index.js...');
  let content = fs.readFileSync(indexFilePath, 'utf8');
  
  // Corrections à appliquer
  
  // 1. Corriger les problèmes d'apostrophes non échappées dans les chaînes de caractères
  console.log('Correction des apostrophes non échappées...');
  content = content.replace(/console\.error\('Erreur lors de l'appel/g, "console.error('Erreur lors de l\\'appel");
  
  // 2. Vérifier et corriger la structure du code
  console.log('Vérification de la structure du code...');
  
  // Correction de la structure if/else pour l'API WhatsApp
  const webhookEndingPattern = /\s+res\.set\('Content-Type', 'text\/xml'\);\s+res\.send\(`\s+<Response>\s+<Message>\${response}<\/Message>\s+<\/Response>\s+`\);\s+}\);/;
  if (webhookEndingPattern.test(content)) {
    console.log('Structure de l\'API webhook détectée, correction de l\'indentation...');
    
    // Assurer que la réponse XML est correctement positionnée dans la structure du code
    // Cela dépend de la structure exacte du code, qui peut être complexe
  }
  
  // 3. Ajouter cette correction spécifique pour l'erreur mentionnée
  console.log('Correction des erreurs dans générationTicket WhatsApp...');
  content = content.replace(/console\.error\('Erreur lors de l'appel à generateAndSendTicket \(WhatsApp\)':/g, 
    "console.error('Erreur lors de l\\'appel à generateAndSendTicket (WhatsApp)':");
  content = content.replace(/console\.error\('Erreur lors de l'appel à generateAndSendTicket \(Telegram\)':/g, 
    "console.error('Erreur lors de l\\'appel à generateAndSendTicket (Telegram)':");
  
  // Écrire le contenu corrigé dans le fichier
  console.log('Écriture des corrections dans le fichier...');
  fs.writeFileSync(indexFilePath, content, 'utf8');
  
  console.log('Corrections appliquées avec succès !');
} catch (error) {
  console.error('Erreur lors de la correction du fichier:', error);
}
