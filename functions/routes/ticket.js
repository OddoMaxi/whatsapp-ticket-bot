const express = require('express');
const router = express.Router();

// Route pour servir les tickets (Twilio/WhatsApp)
router.get('/ticket_:id.png', (req, res) => {
  const filePath = `/tmp/ticket_${req.params.id}.png`;
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Ticket introuvable');
  });
});

module.exports = router;
