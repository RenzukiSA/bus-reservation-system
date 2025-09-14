document.addEventListener('DOMContentLoaded', () => {
    const token = sessionStorage.getItem('adminToken'); // Asumimos que guardas un token o usas la sesión
    if (!checkAuth()) {
        // Si no hay sesión, redirigir al login principal
        // window.location.href = '/'; 
        // Por ahora, solo lo advertimos en consola
        console.warn('No se ha iniciado sesión como administrador.');
    }

    // Cargar la vista inicial (Dashboard)
    loadDashboard();

    // Manejadores de navegación
    document.querySelector('a[href="#dashboard"]').addEventListener('click', loadDashboard);
    document.querySelector('a[href="#reservations"]').addEventListener('click', loadReservations);
    // Añadir el resto de manejadores para rutas, buses, horarios...

    document.getElementById('logout-btn').addEventListener('click', logout);
});

async function checkAuth() {
    try {
        const response = await fetch('/api/admin/status');
        if (!response.ok) return false;
        const data = await response.json();
        return data.isAdmin;
    } catch {
        return false;
    }
}

async function logout(event) {
    event.preventDefault();
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = '/'; // Redirigir a la página principal
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        alert('No se pudo cerrar la sesión.');
    }
}

async function loadDashboard(event) {
    if (event) event.preventDefault();
    const content = document.getElementById('admin-content');
    content.innerHTML = '<h2>Dashboard</h2><p>Cargando estadísticas...</p>';

    try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) throw new Error('No se pudieron cargar los datos del dashboard.');
        const data = await response.json();

        // Aquí construirías una vista más elaborada con los datos
        content.innerHTML = `
            <h2>Dashboard</h2>
            <div class="dashboard-grid">
                <div class="stat-card">
                    <h3>Reservas Confirmadas</h3>
                    <p>${data.reservations_by_status.find(s => s.status === 'confirmed')?.count || 0}</p>
                </div>
                <div class="stat-card">
                    <h3>Reservas Pendientes</h3>
                    <p>${data.reservations_by_status.find(s => s.status === 'pending')?.count || 0}</p>
                </div>
                 <div class="stat-card">
                    <h3>Ingresos del Mes (Ejemplo)</h3>
                    <p>$${data.monthly_revenue[0]?.revenue || 0}</p>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

async function loadReservations(event) {
    if (event) event.preventDefault();
    const content = document.getElementById('admin-content');
    content.innerHTML = '<h2>Reservaciones</h2><p>Cargando reservaciones...</p>';

    try {
        const response = await fetch('/api/admin/reservations');
        if (!response.ok) throw new Error('No se pudieron cargar las reservaciones.');
        const reservations = await response.json();

        let tableHTML = `
            <h2>Reservaciones</h2>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Ruta</th>
                        <th>Fecha</th>
                        <th>Total</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
        `;

        reservations.forEach(res => {
            tableHTML += `
                <tr>
                    <td>${res.id.substring(0, 8)}...</td>
                    <td>${res.customer_name}</td>
                    <td>${res.origin} - ${res.destination}</td>
                    <td>${new Date(res.reservation_date).toLocaleDateString()}</td>
                    <td>$${res.total_price}</td>
                    <td>${res.status}</td>
                </tr>
            `;
        });

        tableHTML += '</tbody></table>';
        content.innerHTML = tableHTML;

    } catch (error) {
        content.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

// Aquí puedes añadir más funciones para cargar las vistas de Rutas, Buses, etc.
// loadRoutesAdmin, loadBusesAdmin, loadSchedulesAdmin...
