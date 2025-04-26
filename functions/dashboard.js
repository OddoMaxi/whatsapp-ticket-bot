// Tableau de bord et réservations pour l'admin (chargé via <script> dans admin.html)

function fetchReservations() {
  fetch('/admin/reservations').then(r => r.json()).then(rows => {
    const tbody = document.querySelector('#reservations-table tbody');
    tbody.innerHTML = '';
    rows.forEach(rsv => {
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
  });
}

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
  const perfLabels = events.map(ev => ev.event_name);
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
});


window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('#reservations-table')) fetchReservations();
  if (document.querySelector('#dashboard-chart')) fetchDashboard();
  if (document.querySelector('#dashboard-table')) fetchDashboard();
});
