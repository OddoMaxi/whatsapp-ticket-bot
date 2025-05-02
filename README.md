# WhatsApp & Telegram Ticket Bot

Système de vente de tickets via WhatsApp et Telegram avec intégration de paiement ChapChap Pay.

## Caractéristiques

- Achat de tickets via WhatsApp et Telegram
- Paiement via ChapChap Pay
- Génération de tickets avec QR codes uniques
- Interface web pour l'achat de tickets
- Gestion des places disponibles

## Prérequis

- Node.js (v14 ou supérieur)
- NPM
- Un compte Telegram Bot (pour la fonctionnalité Telegram)
- Un compte ChapChap Pay (pour les paiements)

## Installation

1. Clonez ce dépôt :
   ```bash
   git clone https://github.com/OddoMaxi/whatsapp-ticket-bot.git
   cd whatsapp-ticket-bot
   ```

2. Installez les dépendances :
   ```bash
   npm install
   cd functions
   npm install
   ```

3. Configurez les variables d'environnement :
   Créez un fichier `.env` dans le dossier `functions` avec les informations suivantes :
   ```
   TELEGRAM_BOT_TOKEN=votre_token_telegram
   ```

## Déploiement

### Important : Installation des dépendances

Lors du déploiement sur un serveur, assurez-vous d'installer les dépendances dans le dossier functions :

```bash
# À la racine du projet
npm install

# Dans le dossier functions
cd functions
npm install
```

Si vous déployez sur une plateforme comme Railway, Heroku ou autre, assurez-vous que le script de post-installation exécute également `npm install` dans le dossier `functions`.

## Structure du projet

- `functions/` - Code principal de l'application
  - `index.js` - Point d'entrée de l'application
  - `bot.js` - Configuration du bot Telegram
  - `services/` - Services utilisés par l'application
    - `chapchap-pay.js` - Service d'intégration avec ChapChap Pay
  - `telegram/` - Commandes et fonctionnalités spécifiques à Telegram
  - `routes/` - Routes API
    - `web-purchase.js` - Routes pour l'achat de tickets via le web

## Utilisation

Pour démarrer le serveur :

```bash
cd functions
node index.js
```

## Intégration de ChapChap Pay

L'intégration avec ChapChap Pay permet de générer des liens de paiement et de vérifier le statut des transactions. Les principaux endpoints utilisés sont :

- Génération de lien de paiement : `https://mapaycard.com/epay/create/`
- Vérification de statut : `https://mapaycard.com/epay/MzcwNDU4MTE/[OPERATION_REFERENCE]/status`

## Licence

ISC
