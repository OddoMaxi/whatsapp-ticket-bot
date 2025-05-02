FROM node:18

WORKDIR /app

# Installer les dépendances système requises pour canvas
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libfontconfig1-dev \
    uuid-dev \
    && rm -rf /var/lib/apt/lists/*

# Copier d'abord uniquement les fichiers package.json
COPY package.json ./
COPY functions/package.json ./functions/

# Créer un script de démarrage simplifié sans postinstall
RUN echo '{"name":"whatsapp-ticket-bot","version":"1.0.0","description":"A WhatsApp ticket bot project.","main":"index.js","scripts":{"start":"node functions/index.js"},"keywords":[],"author":"","license":"ISC","dependencies":{"axios":"^1.9.0"}}' > package.json

# Installer les dépendances du projet principal
RUN npm install

# Installer les dépendances du dossier functions
WORKDIR /app/functions
RUN npm install
WORKDIR /app

# Copier le reste des fichiers du projet
COPY . .

# Exposer le port
EXPOSE 8080

# Commande de démarrage
CMD ["npm", "start"]
