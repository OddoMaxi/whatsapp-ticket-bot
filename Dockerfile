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

# Copier les fichiers package.json et installer les dépendances
COPY package*.json ./
RUN npm install

# Copier les fichiers functions et installer les dépendances
COPY functions/ ./functions/
RUN cd functions && npm install

# Copier le reste des fichiers
COPY . .

# Exposer le port
EXPOSE 8080

# Commande de démarrage
CMD ["npm", "start"]
