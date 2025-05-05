// =============================
// MODULE DE GÉNÉRATION D'IMAGES DE TICKETS
// =============================
const { createCanvas, loadImage, registerFont } = require('canvas');
const QRCode = require('qrcode');
const path = require('path');

// Enregistrement des polices
registerFont(path.join(__dirname, 'fonts/OpenSans-Regular.ttf'), { family: 'Open Sans' });
registerFont(path.join(__dirname, 'fonts/OpenSans-Bold.ttf'), { family: 'Open Sans Bold', weight: 'bold' });

/**
 * Génère une image de ticket avec QR code et informations
 * @param {Object} options - Options pour la génération du ticket
 * @param {string} options.eventName - Nom de l'événement
 * @param {string} options.category - Catégorie du ticket
 * @param {number} options.price - Prix unitaire
 * @param {string} options.formattedId - ID formatté du ticket
 * @param {string} options.qrCode - Valeur pour le QR code
 * @returns {Promise<Buffer>} - Buffer de l'image générée
 */
async function generateTicketImage(options) {
    const { eventName, category, price, formattedId, qrCode } = options;
    
    // Création du canvas
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    
    // Arrière-plan
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Bordure
    ctx.strokeStyle = '#4f46e5'; // Indigo-600
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    
    // En-tête
    ctx.fillStyle = '#4f46e5'; // Indigo-600
    ctx.fillRect(0, 0, canvas.width, 80);
    
    // Texte d'en-tête
    ctx.font = 'bold 32px "Open Sans Bold"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('TICKET', canvas.width / 2, 50);
    
    // Générer le QR code
    const qrBuffer = await QRCode.toBuffer(qrCode, {
        type: 'png',
        width: 200,
        errorCorrectionLevel: 'H',
        margin: 1
    });
    
    const qrImage = await loadImage(qrBuffer);
    
    // Dessiner le QR code
    ctx.drawImage(qrImage, canvas.width - 240, 100, 200, 200);
    
    // Informations du ticket
    ctx.fillStyle = '#111827'; // Gray-900
    ctx.textAlign = 'left';
    
    // Nom de l'événement
    ctx.font = 'bold 28px "Open Sans Bold"';
    ctx.fillText(truncateText(eventName, 25), 40, 130);
    
    // Catégorie
    ctx.font = '20px "Open Sans"';
    ctx.fillStyle = '#6b7280'; // Gray-500
    ctx.fillText(`Catégorie: ${category}`, 40, 170);
    
    // Prix
    ctx.font = 'bold 24px "Open Sans Bold"';
    ctx.fillStyle = '#111827';
    ctx.fillText(`${price} F CFA`, 40, 220);
    
    // Référence du ticket
    ctx.font = '18px "Open Sans"';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`Réf: ${formattedId}`, 40, 260);
    
    // Pied de page
    ctx.font = '14px "Open Sans"';
    ctx.fillStyle = '#9ca3af'; // Gray-400
    ctx.textAlign = 'center';
    ctx.fillText('Ce ticket est valide uniquement lorsqu\'il est présenté avec une pièce d\'identité.', canvas.width / 2, 350);
    ctx.fillText('Veuillez scanner le QR code à l\'entrée.', canvas.width / 2, 370);
    
    // Retourner l'image sous forme de buffer
    return canvas.toBuffer('image/png');
}

/**
 * Tronque un texte s'il dépasse une certaine longueur
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string} - Texte tronqué
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

module.exports = {
    generateTicketImage
};
