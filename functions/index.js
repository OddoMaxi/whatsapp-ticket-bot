const functions = require("firebase-functions");
const { MessagingResponse } = require("twilio").twiml;

exports.whatsappWebhook = functions.https.onRequest((req, res) => {
  const msg = req.body.Body?.toLowerCase();
  const twiml = new MessagingResponse();

  if (msg === "1") {
    twiml.message("🎉 Événements à venir :\n1. Grand Mory\n2. AfroMix\n3. StartUp 2025");
  } else if (msg === "2") {
    twiml.message("Combien de tickets veux-tu pour AfroMix ?");
  } else {
    twiml.message("👋 Salut ! Tape 1 pour voir les événements disponibles.");
  }

  res.set("Content-Type", "text/xml");
  res.status(200).send(twiml.toString());
});
