// Génère un ID de réservation formaté unique par événement
// Format : EVT<eventId>-CAT<catIdx>-T<ticketNum> (ex: EVT12-CAT2-T0001)
function formatReservationId(eventId, catIdx, ticketNum) {
  return `EVT${eventId}-CAT${catIdx}-T${String(ticketNum).padStart(4, '0')}`;
}

module.exports = { formatReservationId };
