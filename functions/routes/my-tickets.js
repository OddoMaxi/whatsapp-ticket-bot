// =============================
// ROUTES POUR LA GESTION DES TICKETS PAR L'UTILISATEUR
// =============================
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { createCanvas, loadImage, registerFont } = require('canvas');
const QRCode = require('qrcode');

// Middleware pour vérifier si l'utilisateur est connecté via un JWT
function requireUserAuth(req, res, next) {
  try {
    // Vérifier si un token existe dans les cookies
    const token = req.cookies.user_token;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentification requise. Veuillez vous connecter.' 
      });
    }
    
    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre_clé_secrète');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Session invalide ou expirée. Veuillez vous reconnecter.' 
    });
  }
}

// Route pour afficher la page "Mes Tickets"
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/my-tickets.html'));
});

// Route pour récupérer tous les tickets d'un utilisateur
router.get('/api/user/tickets', requireUserAuth, async (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../data.sqlite'));
    const { email, phone } = req.user;
    
    // Récupérer les tickets de l'utilisateur (via email ou téléphone)
    const tickets = db.prepare(`
      SELECT 
        r.*, 
        (SELECT COUNT(*) FROM additional_tickets WHERE reservation_id = r.id) as additional_count
      FROM 
        reservations r
      WHERE 
        r.email = ? OR r.phone = ?
      ORDER BY 
        r.date DESC
    `).all(email, phone);
    
    if (!tickets || tickets.length === 0) {
      return res.json({ 
        success: true, 
        tickets: [],
        message: 'Vous n\'avez pas encore acheté de tickets.' 
      });
    }

    // Préparer la réponse
    const formattedTickets = tickets.map(ticket => {
      // Calculer le nombre total de tickets (ticket principal + tickets supplémentaires)
      const totalCount = 1 + (ticket.additional_count || 0);
      
      return {
        id: ticket.id,
        eventName: ticket.event_name,
        categoryName: ticket.category_name,
        quantity: ticket.quantity,
        unitPrice: ticket.unit_price,
        totalPrice: ticket.total_price,
        reference: ticket.formatted_id,
        purchaseDate: new Date(ticket.date).toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        purchaseChannel: ticket.purchase_channel,
        totalCount: totalCount
      };
    });

    res.json({ 
      success: true, 
      tickets: formattedTickets 
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des tickets:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Une erreur est survenue lors de la récupération de vos tickets.' 
    });
  }
});

// Route pour récupérer un ticket spécifique (principal ou additionnel)
router.get('/api/user/tickets/:id', requireUserAuth, async (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../data.sqlite'));
    const { email, phone } = req.user;
    const ticketId = req.params.id;
    
    // Vérifier si c'est un ticket principal
    const mainTicket = db.prepare(`
      SELECT * FROM reservations
      WHERE id = ? AND (email = ? OR phone = ?)
    `).get(ticketId, email, phone);
    
    if (mainTicket) {
      return res.json({ 
        success: true, 
        ticket: {
          id: mainTicket.id,
          eventName: mainTicket.event_name,
          categoryName: mainTicket.category_name,
          unitPrice: mainTicket.unit_price,
          reference: mainTicket.formatted_id,
          qrCode: mainTicket.qr_code || mainTicket.formatted_id,
          purchaseDate: new Date(mainTicket.date).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          ticketNumber: 1,
          isMainTicket: true
        } 
      });
    }
    
    // Si ce n'est pas un ticket principal, vérifier les tickets additionnels
    const additionalTicket = db.prepare(`
      SELECT at.*, r.event_name, r.category_name, r.unit_price, r.email, r.phone, r.date
      FROM additional_tickets at
      JOIN reservations r ON at.reservation_id = r.id
      WHERE at.id = ? AND (r.email = ? OR r.phone = ?)
    `).get(ticketId, email, phone);
    
    if (additionalTicket) {
      return res.json({ 
        success: true, 
        ticket: {
          id: additionalTicket.id,
          eventName: additionalTicket.event_name,
          categoryName: additionalTicket.category_name,
          unitPrice: additionalTicket.unit_price,
          reference: additionalTicket.formatted_id,
          qrCode: additionalTicket.qr_code,
          purchaseDate: new Date(additionalTicket.date).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          ticketNumber: additionalTicket.ticket_number,
          isMainTicket: false
        } 
      });
    }
    
    // Si aucun ticket n'est trouvé
    res.status(404).json({ 
      success: false, 
      message: 'Ticket non trouvé ou vous n\'êtes pas autorisé à y accéder.' 
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du ticket:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Une erreur est survenue lors de la récupération du ticket.' 
    });
  }
});

// Route pour générer et télécharger un ticket en PDF
router.get('/api/user/tickets/:id/download', requireUserAuth, async (req, res) => {
  try {
    const db = new Database(path.join(__dirname, '../data.sqlite'));
    const { email, phone } = req.user;
    const ticketId = req.params.id;
    const format = req.query.format || 'png'; // Format par défaut: PNG
    
    // Fonction pour récupérer les détails du ticket (principal ou additionnel)
    const getTicketDetails = () => {
      // Vérifier si c'est un ticket principal
      const mainTicket = db.prepare(`
        SELECT * FROM reservations
        WHERE id = ? AND (email = ? OR phone = ?)
      `).get(ticketId, email, phone);
      
      if (mainTicket) {
        return {
          eventName: mainTicket.event_name,
          category: mainTicket.category_name,
          price: mainTicket.unit_price,
          formattedId: mainTicket.formatted_id,
          qrCode: mainTicket.qr_code || mainTicket.formatted_id,
          reservationId: mainTicket.id
        };
      }
      
      // Si ce n'est pas un ticket principal, vérifier les tickets additionnels
      const additionalTicket = db.prepare(`
        SELECT at.*, r.event_name, r.category_name, r.unit_price
        FROM additional_tickets at
        JOIN reservations r ON at.reservation_id = r.id
        WHERE at.id = ? AND (r.email = ? OR r.phone = ?)
      `).get(ticketId, email, phone);
      
      if (additionalTicket) {
        return {
          eventName: additionalTicket.event_name,
          category: additionalTicket.category_name,
          price: additionalTicket.unit_price,
          formattedId: additionalTicket.formatted_id,
          qrCode: additionalTicket.qr_code,
          reservationId: additionalTicket.reservation_id,
          ticketNumber: additionalTicket.ticket_number
        };
      }
      
      return null;
    };
    
    const ticketDetails = getTicketDetails();
    
    if (!ticketDetails) {
      return res.status(404).json({ 
        success: false, 
        message: 'Ticket non trouvé ou vous n\'êtes pas autorisé à y accéder.' 
      });
    }
    
    // Générer l'image du ticket
    // Réutiliser la fonction de génération de ticket existante
    const { generateTicketImage } = require('../ticket-generator');
    
    const ticketImage = await generateTicketImage({
      eventName: ticketDetails.eventName,
      category: ticketDetails.category,
      price: ticketDetails.price,
      formattedId: ticketDetails.formattedId,
      qrCode: ticketDetails.qrCode
    });
    
    // Selon le format demandé, renvoyer l'image ou convertir en PDF
    if (format === 'pdf') {
      // Utiliser PDFKit pour générer un PDF (à implémenter si nécessaire)
      // Pour l'instant, on renvoie juste l'image PNG
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketDetails.formattedId}.png"`);
      res.send(ticketImage);
    } else {
      // Format PNG par défaut
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketDetails.formattedId}.png"`);
      res.send(ticketImage);
    }
  } catch (error) {
    console.error('Erreur lors de la génération du ticket:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Une erreur est survenue lors de la génération du ticket.' 
    });
  }
});

// Route pour l'authentification de l'utilisateur (connexion requise avant d'accéder aux tickets)
router.post('/api/user/login', async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    if (!email && !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Veuillez fournir un email ou un numéro de téléphone.' 
      });
    }
    
    // Vérifier si l'utilisateur a déjà acheté des tickets
    const db = new Database(path.join(__dirname, '../data.sqlite'));
    
    const userExists = db.prepare(`
      SELECT COUNT(*) as count FROM reservations
      WHERE email = ? OR phone = ?
    `).get(email || '', phone || '');
    
    if (!userExists || userExists.count === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Aucun ticket trouvé pour cet utilisateur.' 
      });
    }
    
    // Créer un token JWT pour l'authentification
    const token = jwt.sign(
      { email: email || '', phone: phone || '' },
      process.env.JWT_SECRET || 'votre_clé_secrète',
      { expiresIn: '24h' }
    );
    
    // Stocker le token dans un cookie
    res.cookie('user_token', token, { 
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 heures
      sameSite: 'strict'
    });
    
    res.json({ 
      success: true, 
      message: 'Connexion réussie.' 
    });
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Une erreur est survenue lors de la connexion.' 
    });
  }
});

// Route pour déconnecter l'utilisateur
router.post('/api/user/logout', (req, res) => {
  res.clearCookie('user_token');
  res.json({ 
    success: true, 
    message: 'Déconnexion réussie.' 
  });
});

module.exports = router;
