// Tableau de bord et réservations pour l'admin (chargé via <script> dans admin.html)

let allReservations = [];
let allEvents = [];

function populateEventAndCategoryFilters() {
  const eventSelect = document.getElementById('filter-event');
  const catSelect = document.getElementById('filter-category');
  // Remplir événements
  eventSelect.innerHTML = '<option value="">Tous les événements</option>' +
    allEvents.map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('');
  // Remplir catégories selon événement sélectionné
  const selectedEventId = eventSelect.value;
  let cats = [];
  if (selectedEventId) {
    const ev = allEvents.find(e => String(e.id) === String(selectedEventId));
    if (ev && ev.categories) cats = ev.categories.map(c => c.name);
  } else {
    // Toutes les catégories uniques
    cats = [...new Set(allEvents.flatMap(ev => ev.categories.map(c => c.name)))];
  }
  catSelect.innerHTML = '<option value="">Toutes les catégories</option>' + cats.map(name => `<option value="${name}">${name}</option>`).join('');
}

function applyReservationFilters() {
  const eventVal = document.getElementById('filter-event').value;
  const catVal = document.getElementById('filter-category').value;
  const dateVal = document.getElementById('filter-date').value;
  let filtered = allReservations;
  if (eventVal) filtered = filtered.filter(r => String(r.event_id) === String(eventVal));
  if (catVal) filtered = filtered.filter(r => r.category_name === catVal);
  if (dateVal) filtered = filtered.filter(r => r.date && new Date(r.date).toISOString().slice(0,10) === dateVal);
  renderReservationsTable(filtered);
}

function renderReservationsTable(filteredRows) {
  const tbody = document.querySelector('#reservations-table tbody');
  tbody.innerHTML = '';
  filteredRows.forEach(rsv => {
    tbody.innerHTML += `<tr>
      <td>${rsv.user}</td>
      <td>${rsv.phone || ''}</td>
      <td>${rsv.event_name}</td>
      <td>${rsv.category_name}</td>
      <td>${rsv.quantity}</td>
      <td>${rsv.unit_price} F</td>
      <td>${rsv.total_price} F</td>
      <td>${new Date(rsv.date).toLocaleString()}</td>
    </tr>`;
  });
}

function fetchReservations() {
  Promise.all([
    fetch('/admin/reservations').then(r => r.json()),
    fetch('/admin/dashboard').then(r => r.json())
  ]).then(([reservations, events]) => {
    allReservations = reservations;
    allEvents = events.map(ev => ({ ...ev, categories: ev.categories || [] }));
    populateEventAndCategoryFilters();
    applyReservationFilters();
  });
}

// Bind filters
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('filter-event')) {
    document.getElementById('filter-event').addEventListener('change', () => {
      populateEventAndCategoryFilters();
      applyReservationFilters();
    });
  }
  if (document.getElementById('filter-category')) {
    document.getElementById('filter-category').addEventListener('change', applyReservationFilters);
  }
  if (document.getElementById('filter-date')) {
    document.getElementById('filter-date').addEventListener('change', applyReservationFilters);
  }
});

async function fetchDashboard() {
  // 1. Données événements et catégories
  const events = await fetch('/admin/dashboard').then(r => r.json());
  // 2. Données réservations
  const reservations = await fetch('/admin/reservations').then(r => r.json());

  // ----- Carte Total ventes -----
  let totalSales = 0;
  events.forEach(ev => ev.categories.forEach(cat => {
    totalSales += (cat.sold || 0) * (cat.price || cat.prix || 0);
  }));
  document.getElementById('total-sales').textContent = totalSales.toLocaleString() + ' F';

  // ----- Carte Activité récente -----
  const recent = reservations.slice(-5).reverse();
  const ul = document.getElementById('recent-activity');
  ul.innerHTML = recent.length ? '' : '<li>Aucune réservation récente</li>';
  recent.forEach(rsv => {
    ul.innerHTML += `<li><span class="font-bold">${rsv.user}</span> - <span>${rsv.event_name}</span> <span class="text-xs text-gray-200">(${new Date(rsv.date).toLocaleString()})</span></li>`;
  });

  // ----- Performance (bar chart) -----
  const perfLabels = events.map(ev => ev.name);
  const perfData = events.map(ev => ev.categories.reduce((sum, cat) => sum + (cat.sold || 0), 0));
  const ctxPerf = document.getElementById('performance-chart').getContext('2d');
  if(window.performanceChart) window.performanceChart.destroy();
  window.performanceChart = new Chart(ctxPerf, {
    type: 'bar',
    data: {
      labels: perfLabels,
      datasets: [{
        label: 'Tickets vendus',
        data: perfData,
        backgroundColor: 'rgba(220,38,38,0.7)',
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#222' } }, y: { beginAtZero: true, ticks: { color: '#222' } } }
    }
  });

  // ----- Pie chart : tickets par catégorie -----
  const catMap = {};
  events.forEach(ev => ev.categories.forEach(cat => {
    catMap[cat.name] = (catMap[cat.name] || 0) + (cat.sold || 0);
  }));
  const pieLabels = Object.keys(catMap);
  const pieData = Object.values(catMap);
  const ctxPie = document.getElementById('pie-metric').getContext('2d');
  if(window.pieMetric) window.pieMetric.destroy();
  window.pieMetric = new Chart(ctxPie, {
    type: 'pie',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieData,
        backgroundColor: ['#dc2626', '#f87171', '#fbbf24', '#38bdf8', '#22d3ee', '#a3e635'],
      }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#222' } } } }
  });

  // ----- Line chart : ventes cumulées sur le temps -----
  // On suppose que reservations est trié par date croissante
  let cum = 0;
  const lineLabels = reservations.map(rsv => new Date(rsv.date).toLocaleDateString());
  const lineData = reservations.map(rsv => cum += (rsv.total_price || 0));
  const ctxLine = document.getElementById('line-metric').getContext('2d');
  if(window.lineMetric) window.lineMetric.destroy();
  window.lineMetric = new Chart(ctxLine, {
    type: 'line',
    data: {
      labels: lineLabels,
      datasets: [{
        label: 'Ventes cumulées (F)',
        data: lineData,
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.1)',
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { color: '#222' } }, y: { ticks: { color: '#222' } } }
    }
  });

  // ----- Scatter chart : quantité vs prix pour chaque réservation -----
  const scatterData = reservations.map(rsv => ({ x: rsv.quantity || 1, y: rsv.unit_price || 0 }));
  const ctxScatter = document.getElementById('scatter-metric').getContext('2d');
  if(window.scatterMetric) window.scatterMetric.destroy();
  window.scatterMetric = new Chart(ctxScatter, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Quantité vs Prix unitaire',
        data: scatterData,
        backgroundColor: '#fff',
        borderColor: '#fff',
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Quantité', color: '#fff' }, ticks: { color: '#fff' } },
        y: { title: { display: true, text: 'Prix unitaire', color: '#fff' }, ticks: { color: '#fff' } }
      }
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('#reservations-table')) fetchReservations();
  fetchDashboard();

  // Export CSV réservations
  const exportBtn = document.getElementById('export-csv-btn');
  if(exportBtn) {
    exportBtn.addEventListener('click', async () => {
      // Exporte seulement les réservations filtrées actuellement affichées
      const eventVal = document.getElementById('filter-event').value;
      const catVal = document.getElementById('filter-category').value;
      const dateVal = document.getElementById('filter-date').value;
      let filtered = allReservations;
      if (eventVal) filtered = filtered.filter(r => String(r.event_id) === String(eventVal));
      if (catVal) filtered = filtered.filter(r => r.category_name === catVal);
      if (dateVal) filtered = filtered.filter(r => r.date && new Date(r.date).toISOString().slice(0,10) === dateVal);
      if(!filtered.length) return showAlert('Aucune réservation à exporter','warning');
      const headers = ['Utilisateur','Téléphone','Événement','Catégorie','Quantité','Prix unitaire','Total','Date','Code'];
      const csv = [headers.join(',')].concat(
        filtered.map(rsv => [
          rsv.user,
          rsv.phone||'',
          rsv.event_name,
          rsv.category_name,
          rsv.quantity,
          rsv.unit_price,
          rsv.total_price,
          new Date(rsv.date).toLocaleString(),
          rsv.code||''
        ].map(v => '"'+String(v).replace(/"/g,'""')+'"').join(','))
      ).join('\r\n');
      const blob = new Blob([csv], {type: 'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0,10);
      a.href = url;
      a.download = `reservations_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 200);
    });
  }

  // Export CSV QR Codes (tickets) PAR EVENEMENT ET CATEGORIE
  function bindExportQRCsvBtns() {
    document.querySelectorAll('.export-qrcsv-btn').forEach(btn => {
      btn.onclick = async function() {
        const event_id = btn.getAttribute('data-event-id');
        const event_name = btn.getAttribute('data-event-name');
        const category_name = btn.getAttribute('data-category-name');
        let res, rows;
        try {
          res = await fetch(`/admin/tickets?event_id=${encodeURIComponent(event_id)}&category_name=${encodeURIComponent(category_name)}`);
          rows = await res.json();
        } catch(e) {
          showAlert('L'export des codes QR nécessite une route /admin/tickets côté backend qui retourne la liste des tickets générés filtrables par event_id et category_name.','error');
          return;
        }
        if(!rows || !rows.length) return showAlert('Aucun code QR/ticket à exporter pour cette catégorie.','warning');
        const headers = ['Événement','Catégorie','Code','Statut','Utilisateur','Téléphone','Date de réservation'];
        const csv = [headers.join(',')].concat(
          rows.map(t => {
            // Garantir que le code est toujours présent
            const code = t.code || t.formatted_id || t.qr_code || `TICKET-${t.event_id}`;
            
            return [
              t.event_name,
              t.category_name,
              code, // Utiliser le code garanti
              t.status||'',
              t.user||'',
              t.phone||'',
              t.date ? new Date(t.date).toLocaleString() : ''
            ].map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',');
          })
        ).join('\r\n');
        const blob = new Blob([csv], {type: 'text/csv'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0,10);
        a.href = url;
        a.download = `qrcodes_${event_name}_${category_name}_${date}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 200);
      }
    });
  }
  // Appeler ce binding après chaque render du tableau events
  window.bindExportQRCsvBtns = bindExportQRCsvBtns;
  // Pour le premier affichage (si events déjà présents)
  bindExportQRCsvBtns();
});


window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('#reservations-table')) fetchReservations();
  if (document.querySelector('#dashboard-chart')) fetchDashboard();
  if (document.querySelector('#dashboard-table')) fetchDashboard();
});
