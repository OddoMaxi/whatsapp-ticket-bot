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

# Copier TOUS les fichiers du projet en une seule fois
COPY . .

# Supprimer le script postinstall du package.json principal car nous allons installer manuellement
RUN sed -i '/postinstall/d' package.json

# Installer les dépendances du projet principal
RUN npm install

# Installer les dépendances du dossier functions séparément
RUN cd functions && npm install

# Exposer le port
EXPOSE 8080

# Commande de démarrage
CMD ["npm", "start"]
