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

function fetchDashboard() {
  fetch('/admin/dashboard').then(r => r.json()).then(items => {
    const tbody = document.querySelector('#dashboard-table tbody');
    tbody.innerHTML = '';
    items.forEach(ev => {
      ev.categories.forEach(cat => {
        tbody.innerHTML += `<tr>
          <td>${ev.event_name}</td>
          <td>${cat.name}</td>
          <td>${cat.price} F</td>
          <td>${cat.total}</td>
          <td>${cat.sold}</td>
          <td>${cat.left < 1 ? '<span style=\'color:red;font-weight:bold\'>RUPTURE</span>' : cat.left}</td>
          <td>${cat.sales} F</td>
        </tr>`;
      });
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('#reservations-table')) fetchReservations();
  if (document.querySelector('#dashboard-table')) fetchDashboard();
});
