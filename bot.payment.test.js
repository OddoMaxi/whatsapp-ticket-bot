// Tests automatisés pour la logique de paiement avant génération/envoi de ticket (Telegram)
const { processMessage, processSuccessfulPayment } = require('./chapchap-whatsapp-test');

describe('Flux paiement Telegram', () => {
  let userStates;
  const userId = 'telegram:12345';

  beforeEach(() => {
    userStates = {};
  });

  test('Refus de générer un ticket sans paiement', async () => {
    // L'utilisateur confirme la réservation
    userStates[userId] = { step: 'confirm', eventId: 1 };
    const result = processMessage('oui', userId, userStates);
    // On attend une demande de paiement, pas de ticket généré
    expect(result.response).toMatch(/payer|paiement/i);
    expect(result.newState.step).toBe('wait_payment');
    // Tentative de génération de ticket sans paiement validé
    const ticketResult = processSuccessfulPayment(userId, userStates);
    expect(ticketResult).toBeNull();
  });

  test('Flux complet : paiement requis puis ticket généré', async () => {
    // L'utilisateur confirme la réservation
    userStates[userId] = { step: 'confirm', eventId: 1 };
    let result = processMessage('oui', userId, userStates);
    expect(result.response).toMatch(/payer|paiement/i);
    expect(result.newState.step).toBe('wait_payment');
    // Simuler paiement validé
    userStates[userId].paymentValidated = true;
    const ticketResult = processSuccessfulPayment(userId, userStates);
    expect(ticketResult).not.toBeNull();
    expect(ticketResult.ticket).toBeDefined();
  });

  test('Tentative de bypass paiement', async () => {
    // L'utilisateur tente d'obtenir un ticket sans payer
    userStates[userId] = { step: 'wait_payment', eventId: 1 };
    const ticketResult = processSuccessfulPayment(userId, userStates);
    expect(ticketResult).toBeNull();
  });

  test('Paiement partiel/invalide', async () => {
    userStates[userId] = { step: 'wait_payment', eventId: 1, paymentValidated: false };
    const ticketResult = processSuccessfulPayment(userId, userStates);
    expect(ticketResult).toBeNull();
  });

  test('Double paiement : ticket envoyé une seule fois', async () => {
    userStates[userId] = { step: 'wait_payment', eventId: 1, paymentValidated: true, ticketSent: false };
    const first = processSuccessfulPayment(userId, userStates);
    expect(first).not.toBeNull();
    userStates[userId].ticketSent = true;
    const second = processSuccessfulPayment(userId, userStates);
    expect(second).toBeNull();
  });
});
