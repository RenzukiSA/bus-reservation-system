document.addEventListener('DOMContentLoaded', async () => {
    const isAdmin = await checkAuth();
    if (!isAdmin) {
        window.location.href = '/';
        return;
    }
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
    const pageTitles = {
        dashboard: 'Dashboard',
        reservations: 'Gestionar Reservaciones',
        routes: 'Gestionar Rutas',
        buses: 'Gestionar Autobuses',
        schedules: 'Gestionar Horarios'
    };
    contentTitle.textContent = pageTitles[sectionId] || 'Panel';

    switch (sectionId) {
        case 'dashboard': loadDashboard(); break;
        case 'reservations': loadReservations(); break;
        case 'routes': loadRoutesAdmin(); break;
        case 'buses': renderPlaceholder('Autobuses'); break;
        case 'schedules': renderPlaceholder('Horarios'); break;
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
                <div class="stat-card"><h3>Reservas Confirmadas</h3><p>${data.reservations_by_status.find(s => s.status === 'confirmed')?.count || 0}</p></div>
                <div class="stat-card"><h3>Reservas Pendientes</h3><p>${data.reservations_by_status.find(s => s.status === 'pending')?.count || 0}</p></div>
                <div class="stat-card"><h3>Ingresos del Mes (Ejemplo)</h3><p>$${data.monthly_revenue[0]?.revenue || '0.00'}</p></div>
            </div>`;
    } catch (error) {
        content.innerHTML = `<p class="error-message">${error.message}</p>`;
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
                <thead><tr><th>ID</th><th>Cliente</th><th>Ruta</th><th>Fecha Viaje</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>`;
        if (reservations.length === 0) {
            tableHTML += '<tr><td colspan="7" style="text-align: center;">No hay reservaciones.</td></tr>';
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
                        <td>
                            ${res.status === 'pending' ? `<button class="btn-confirm" onclick="handleUpdateReservationStatus('${res.id}', 'confirmed')">Confirmar</button>` : ''}
                            ${res.status !== 'cancelled' ? `<button class="btn-cancel" onclick="handleUpdateReservationStatus('${res.id}', 'cancelled')">Cancelar</button>` : ''}
                        </td>
                    </tr>`;
            });
        }
        tableHTML += '</tbody></table>';
        content.innerHTML = tableHTML;
    } catch (error) {
        content.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

async function handleUpdateReservationStatus(id, status) {
    const action = status === 'confirmed' ? 'confirmar' : 'cancelar';
    if (!confirm(`¿Estás seguro de que quieres ${action} esta reservación?`)) return;

    try {
        const response = await fetch(`/api/admin/reservations/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo actualizar la reservación.');
        }
        loadReservations(); // Recargar la lista
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function loadRoutesAdmin() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Cargando rutas...</p>';
    try {
        const response = await fetch('/api/admin/routes');
        if (!response.ok) throw new Error('No se pudieron cargar las rutas.');
        const routes = await response.json();
        
        let contentHTML = `
            <div class="admin-form">
                <h3>Añadir Nueva Ruta</h3>
                <form id="add-route-form">
                    <div class="form-group"><label for="origin">Origen</label><input type="text" id="origin" required></div>
                    <div class="form-group"><label for="destination">Destino</label><input type="text" id="destination" required></div>
                    <button type="submit">Añadir Ruta</button>
                </form>
            </div>
            <table class="admin-table">
                <thead><tr><th>Origen</th><th>Destino</th><th>Acciones</th></tr></thead>
                <tbody>`;
        
        if (routes.length === 0) {
            contentHTML += '<tr><td colspan="3" style="text-align: center;">No hay rutas definidas.</td></tr>';
        } else {
            routes.forEach(route => {
                contentHTML += `
                    <tr data-id="${route.id}">
                        <td data-label="origin">${route.origin}</td>
                        <td data-label="destination">${route.destination}</td>
                        <td>
                            <button class="btn-edit" onclick="showEditForm(${route.id})">Editar</button>
                            <button class="btn-delete" onclick="handleDeleteRoute(${route.id})">Eliminar</button>
                        </td>
                    </tr>`;
            });
        }
        contentHTML += '</tbody></table>';
        content.innerHTML = contentHTML;

        document.getElementById('add-route-form').addEventListener('submit', handleCreateRoute);
    } catch (error) {
        content.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

async function handleCreateRoute(event) {
    event.preventDefault();
    const origin = document.getElementById('origin').value;
    const destination = document.getElementById('destination').value;
    try {
        const response = await fetch('/api/admin/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo crear la ruta.');
        }
        loadRoutesAdmin(); // Recargar la lista de rutas
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function handleDeleteRoute(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar esta ruta?')) return;
    try {
        const response = await fetch(`/api/admin/routes/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo eliminar la ruta.');
        }
        loadRoutesAdmin();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function showEditForm(id) {
    const row = document.querySelector(`tr[data-id='${id}']`);
    const origin = row.querySelector("td[data-label='origin']").textContent;
    const destination = row.querySelector("td[data-label='destination']").textContent;

    row.innerHTML = `
        <td><input type="text" value="${origin}" id="edit-origin-${id}"></td>
        <td><input type="text" value="${destination}" id="edit-destination-${id}"></td>
        <td>
            <button class="btn-save" onclick="handleUpdateRoute(${id})">Guardar</button>
            <button class="btn-cancel" onclick="loadRoutesAdmin()">Cancelar</button>
        </td>`;
}

async function handleUpdateRoute(id) {
    const origin = document.getElementById(`edit-origin-${id}`).value;
    const destination = document.getElementById(`edit-destination-${id}`).value;
    try {
        const response = await fetch(`/api/admin/routes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo actualizar la ruta.');
        }
        loadRoutesAdmin();
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

function renderPlaceholder(sectionName) {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <div class="stat-card" style="text-align: left;">
            <h3>Sección de ${sectionName}</h3>
            <p style="font-size: 1rem; font-weight: 400;">
                Esta sección está lista para ser desarrollada.
            </p>
        </div>`;
}

