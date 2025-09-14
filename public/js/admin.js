document.addEventListener('DOMContentLoaded', async () => {
    // Verificar si el usuario es administrador al cargar la página
    const isAdmin = await checkAuth();
    if (!isAdmin) {
        // Si no es admin, redirigir a la página principal
        window.location.href = '/';
        return; // Detener la ejecución del script
    }

    // Cargar la vista inicial (Dashboard) y configurar la navegación
    setupNavigation();
    loadDashboard(); 
});

// --- FUNCIONES DE AUTENTICACIÓN Y NAVEGACIÓN ---

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

function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Actualizar el estado activo del link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('href').substring(1);
            loadSection(targetId);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
}

function loadSection(sectionId) {
    const contentTitle = document.getElementById('content-title');
    
    switch (sectionId) {
        case 'dashboard':
            contentTitle.textContent = 'Dashboard';
            loadDashboard();
            break;
        case 'reservations':
            contentTitle.textContent = 'Gestionar Reservaciones';
            loadReservations();
            break;
        case 'routes':
            contentTitle.textContent = 'Gestionar Rutas';
            // Aquí iría la función loadRoutesAdmin();
            renderPlaceholder('Rutas');
            break;
        case 'buses':
            contentTitle.textContent = 'Gestionar Autobuses';
            // Aquí iría la función loadBusesAdmin();
            renderPlaceholder('Autobuses');
            break;
        case 'schedules':
            contentTitle.textContent = 'Gestionar Horarios';
            // Aquí iría la función loadSchedulesAdmin();
            renderPlaceholder('Horarios');
            break;
    }
}

async function logout(event) {
    event.preventDefault();
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        alert('No se pudo cerrar la sesión.');
    }
}

// --- FUNCIONES PARA CARGAR CONTENIDO DE SECCIONES ---

async function loadDashboard() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Cargando estadísticas...</p>';

    try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) throw new Error('No se pudieron cargar los datos.');
        const data = await response.json();

        content.innerHTML = `
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
                    <p>$${data.monthly_revenue[0]?.revenue || '0.00'}</p>
                </div>
            </div>
        `;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

async function loadReservations() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Cargando reservaciones...</p>';

    try {
        const response = await fetch('/api/admin/reservations');
        if (!response.ok) throw new Error('No se pudieron cargar las reservaciones.');
        const reservations = await response.json();

        let tableHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Cliente</th>
                        <th>Ruta</th>
                        <th>Fecha Viaje</th>
                        <th>Total</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (reservations.length === 0) {
            tableHTML += '<tr><td colspan="6" style="text-align: center;">No hay reservaciones para mostrar.</td></tr>';
        } else {
            reservations.forEach(res => {
                tableHTML += `
                    <tr>
                        <td>${res.id.substring(0, 8)}...</td>
                        <td>${res.customer_name}</td>
                        <td>${res.origin} → ${res.destination}</td>
                        <td>${new Date(res.reservation_date).toLocaleDateString()}</td>
                        <td>$${res.total_price}</td>
                        <td><span class="status status-${res.status}">${res.status}</span></td>
                    </tr>
                `;
            });
        }

        tableHTML += '</tbody></table>';
        content.innerHTML = tableHTML;

    } catch (error) {
        content.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}

// Función de marcador de posición para secciones no implementadas
function renderPlaceholder(sectionName) {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <div class="stat-card" style="text-align: left;">
            <h3>Sección de ${sectionName}</h3>
            <p style="font-size: 1rem; font-weight: 400;">
                Esta sección está lista
                </p>
        </div>
    `;
}

