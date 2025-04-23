const express = require('express');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: false }));

app.post('/webhook', (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message('Merci pour votre message !');

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
