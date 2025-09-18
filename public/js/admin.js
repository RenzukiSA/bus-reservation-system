document.addEventListener('DOMContentLoaded', async () => {
    // --- Check authentication and initialize --- 
    const isAdmin = await checkAuth();
    if (!isAdmin) {
        // If not admin, show a login modal instead of redirecting
        showLoginModal();
    } else {
        // If admin, initialize the panel
        initializePanel();
    }
});

function initializePanel() {
    document.body.classList.add('logged-in'); // Add class to show main content
    setupNavigation();
    loadSection('dashboard'); // Load dashboard by default
    setupResponsiveSidebar();
}

function setupResponsiveSidebar() {
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !sidebarToggle.contains(e.target) && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
    }
}

// --- AUTHENTICATION & NAVIGATION --- 

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

function showLoginModal() {
    const modalHTML = `
        <div id="login-modal" class="auth-modal">
            <div class="auth-modal-content">
                <h3><i class="fas fa-user-shield"></i> Acceso de Administrador</h3>
                <form id="login-form">
                    <div class="form-group">
                        <label for="password">Contraseña</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Ingresar</button>
                    <p id="login-error" class="error-message"></p>
                </form>
                 <a href="/" class="back-link">Volver a la página principal</a>
            </div>
        </div>
    `;
    document.body.innerHTML = modalHTML;
    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Contraseña incorrecta');
        
        // On success, reload the page to initialize the panel
        window.location.reload();

    } catch (error) {
        errorEl.textContent = error.message;
    }
}

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const targetId = link.getAttribute('href').substring(1);
            loadSection(targetId);
        });
    });
    document.getElementById('logout-btn').addEventListener('click', logout);
}

async function logout(e) {
    e.preventDefault();
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        showNotification('Error al cerrar sesión.', 'error');
    }
}

// --- DYNAMIC CONTENT LOADING --- 

function loadSection(sectionId) {
    const contentTitle = document.getElementById('content-title');
    const titles = {
        dashboard: 'Dashboard',
        reservations: 'Gestionar Reservaciones',
        routes: 'Gestionar Rutas',
        buses: 'Gestionar Autobuses',
        schedules: 'Gestionar Horarios'
    };
    contentTitle.textContent = titles[sectionId] || 'Panel';

    switch (sectionId) {
        case 'dashboard': loadDashboard(); break;
        case 'reservations': loadReservations(); break;
        case 'routes': loadRoutesAdmin(); break;
        case 'buses': loadBusesAdmin(); break;
        case 'schedules': loadSchedulesAdmin(); break;
    }
}

// --- DASHBOARD SECTION --- 

async function loadDashboard() {
    const content = document.getElementById('admin-content');
    content.innerHTML = getLoaderHTML('Cargando estadísticas...');
    try {
        const response = await fetch('/api/admin/dashboard');
        if (!response.ok) throw new Error('No se pudieron cargar los datos del dashboard.');
        const data = await response.json();
        
        const confirmed = data.reservations_by_status.find(s => s.status === 'confirmed')?.count || 0;
        const pending = data.reservations_by_status.find(s => s.status === 'pending')?.count || 0;
        const total = confirmed + pending + (data.reservations_by_status.find(s => s.status === 'cancelled')?.count || 0);
        const revenue = data.monthly_revenue[0]?.revenue || '0.00';

        content.innerHTML = `
            <div class="dashboard-grid">
                <div class="stat-card"><h3><i class="fas fa-ticket-alt"></i> Total Reservas</h3><p>${total}</p></div>
                <div class="stat-card"><h3><i class="fas fa-check-circle"></i> Confirmadas</h3><p>${confirmed}</p></div>
                <div class="stat-card"><h3><i class="fas fa-clock"></i> Pendientes</h3><p>${pending}</p></div>
                <div class="stat-card"><h3><i class="fas fa-dollar-sign"></i> Ingresos (Mes)</h3><p>$${parseFloat(revenue).toFixed(2)}</p></div>
            </div>`;
    } catch (error) {
        content.innerHTML = getErrorHTML(error.message);
    }
}

// --- RESERVATIONS SECTION ---

async function loadReservations() {
    const content = document.getElementById('admin-content');
    content.innerHTML = getLoaderHTML('Cargando reservaciones...');
    try {
        const response = await fetch('/api/admin/reservations');
        if (!response.ok) throw new Error('No se pudieron cargar las reservaciones.');
        const reservations = await response.json();
        let tableHTML = `
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>ID</th><th>Cliente</th><th>Ruta</th><th>Fecha Viaje</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>
                    <tbody>`;
        if (reservations.length === 0) {
            tableHTML += '<tr><td colspan="7">No hay reservaciones.</td></tr>';
        } else {
            reservations.forEach(res => {
                tableHTML += `
                    <tr>
                        <td><code>${res.id.substring(0, 8)}...</code></td>
                        <td>${res.customer_name}</td>
                        <td>${res.origin} → ${res.destination}</td>
                        <td>${new Date(res.reservation_date).toLocaleDateString('es-ES', { timeZone: 'UTC' })}</td>
                        <td>$${res.total_price}</td>
                        <td><span class="status-badge status-${res.status}">${res.status}</span></td>
                        <td class="actions">
                            ${res.status === 'pending' ? `<button class="btn btn-sm btn-success" onclick="updateReservationStatus('${res.id}', 'confirmed')">Confirmar</button>` : ''}
                            ${res.status !== 'cancelled' && res.status !== 'expired' ? `<button class="btn btn-sm btn-danger" onclick="updateReservationStatus('${res.id}', 'cancelled')">Cancelar</button>` : ''}
                        </td>
                    </tr>`;
            });
        }
        tableHTML += '</tbody></table></div>';
        content.innerHTML = tableHTML;
    } catch (error) {
        content.innerHTML = getErrorHTML(error.message);
    }
}

async function updateReservationStatus(id, status) {
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
        showNotification('Reservación actualizada.', 'success');
        loadReservations(); // Refresh list
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// --- ROUTES, BUSES, SCHEDULES (Generic CRUD functions) ---

const SECTIONS_CONFIG = {
    routes: {
        plural: 'Rutas',
        singular: 'Ruta',
        endpoint: '/api/routes',
        columns: ['Origen', 'Destino', 'Distancia (km)', 'Precio Base'],
        fields: {
            origin: { label: 'Origen', type: 'text', required: true },
            destination: { label: 'Destino', type: 'text', required: true },
            distance_km: { label: 'Distancia (km)', type: 'number' },
            base_price: { label: 'Precio Base', type: 'number', step: '0.01', required: true },
        },
        renderRow: (item) => `
            <td>${item.origin}</td>
            <td>${item.destination}</td>
            <td>${item.distance_km || 'N/A'}</td>
            <td>$${item.base_price}</td>`
    },
    buses: {
        plural: 'Autobuses',
        singular: 'Autobús',
        endpoint: '/api/buses',
        columns: ['Número', 'Tipo', 'Capacidad', 'Estado'],
        fields: {
            bus_number: { label: 'Número de Bus', type: 'text', required: true },
            type: { label: 'Tipo', type: 'select', options: { economico: 'Económico', primera_clase: 'Primera Clase', ejecutivo: 'Ejecutivo' }, required: true },
            capacity: { label: 'Capacidad', type: 'number', required: true },
            status: { label: 'Estado', type: 'select', options: { active: 'Activo', inactive: 'Inactivo', maintenance: 'Mantenimiento' }, required: true },
        },
        renderRow: (item) => `
            <td>${item.bus_number}</td>
            <td>${item.type.replace('_', ' ')}</td>
            <td>${item.capacity}</td>
            <td><span class="status-badge status-${item.status}">${item.status}</span></td>`
    },
    schedules: {
        plural: 'Horarios',
        singular: 'Horario',
        endpoint: '/api/admin/schedules',
        columns: ['Ruta', 'Autobús', 'Salida', 'Llegada', 'Días', 'Estado'],
        fields: {
            route_id: { label: 'Ruta', type: 'select', required: true, source: 'routes' },
            bus_id: { label: 'Autobús', type: 'select', required: true, source: 'buses' },
            departure_time: { label: 'Hora de Salida', type: 'time', required: true },
            arrival_time: { label: 'Hora de Llegada', type: 'time', required: true },
            days_of_week: { label: 'Días de Semana', type: 'multicheck', options: { monday: 'Lu', tuesday: 'Ma', wednesday: 'Mi', thursday: 'Ju', friday: 'Vi', saturday: 'Sá', sunday: 'Do', daily: 'Diario' }, required: true },
            price_multiplier: { label: 'Multiplicador Precio', type: 'number', step: '0.1', defaultValue: 1.0 },
            status: { label: 'Estado', type: 'select', options: { active: 'Activo', inactive: 'Inactivo' }, required: true },
        },
        renderRow: (item) => `
            <td>${item.origin} → ${item.destination}</td>
            <td>${item.bus_number}</td>
            <td>${item.departure_time}</td>
            <td>${item.arrival_time}</td>
            <td>${(Array.isArray(item.days_of_week) ? item.days_of_week : []).join(', ')}</td>
            <td><span class="status-badge status-${item.status}">${item.status}</span></td>`
    }
};

async function loadGenericAdminSection(sectionKey) {
    const config = SECTIONS_CONFIG[sectionKey];
    const content = document.getElementById('admin-content');
    content.innerHTML = getLoaderHTML(`Cargando ${config.plural}...`);

    try {
        const response = await fetch(config.endpoint);
        if (!response.ok) throw new Error(`No se pudieron cargar los ${config.plural}.`);
        const items = await response.json();

        let tableHTML = `
            <div class="section-header">
                <h3>${config.plural}</h3>
                <button class="btn btn-primary" onclick="showEditModal('${sectionKey}')"><i class="fas fa-plus"></i> Agregar ${config.singular}</button>
            </div>
            <div class="table-container">
                <table class="admin-table">
                    <thead><tr><th>ID</th>${config.columns.map(c => `<th>${c}</th>`).join('')}<th>Acciones</th></tr></thead>
                    <tbody>`;

        if (items.length === 0) {
            tableHTML += `<tr><td colspan="${config.columns.length + 2}">No hay ${config.plural}.</td></tr>`;
        } else {
            items.forEach(item => {
                tableHTML += `
                    <tr>
                        <td>${item.id}</td>
                        ${config.renderRow(item)}
                        <td class="actions">
                            <button class="btn btn-sm btn-secondary" onclick="showEditModal('${sectionKey}', ${item.id})">Editar</button>
                            <button class="btn btn-sm btn-danger" onclick="handleDeleteItem('${sectionKey}', ${item.id})">Eliminar</button>
                        </td>
                    </tr>`;
            });
        }
        tableHTML += '</tbody></table></div>';
        content.innerHTML = tableHTML;
    } catch (error) {
        content.innerHTML = getErrorHTML(error.message);
    }
}

async function showEditModal(sectionKey, itemId = null) {
    const config = SECTIONS_CONFIG[sectionKey];
    const isEdit = itemId !== null;
    const title = isEdit ? `Editar ${config.singular}` : `Agregar ${config.singular}`;

    let item = {};
    if (isEdit) {
        try {
            const response = await fetch(`${config.endpoint}/${itemId}`);
            if (!response.ok) throw new Error('No se pudo cargar el item.');
            item = await response.json();
        } catch (error) {
            showNotification(error.message, 'error');
            return;
        }
    }

    let formFieldsHTML = '';
    for (const [key, field] of Object.entries(config.fields)) {
        const value = item[key] || field.defaultValue || '';
        formFieldsHTML += '<div class="form-group">';
        formFieldsHTML += `<label for="field-${key}">${field.label}</label>`;
        if (field.type === 'select') {
            let options = field.options || {};
            if (field.source) { // Dynamically load options
                try {
                    const res = await fetch(SECTIONS_CONFIG[field.source].endpoint);
                    const sourceItems = await res.json();
                    if (field.source === 'routes') options = sourceItems.reduce((acc, i) => ({ ...acc, [i.id]: `${i.origin} → ${i.destination}` }), {});
                    if (field.source === 'buses') options = sourceItems.reduce((acc, i) => ({ ...acc, [i.id]: `${i.bus_number} (${i.capacity} asientos)` }), {});
                } catch { /* ignore */ }
            }
            formFieldsHTML += `<select id="field-${key}" ${field.required ? 'required' : ''}>`;
            formFieldsHTML += '<option value="">Seleccionar...</option>';
            for (const [optValue, optLabel] of Object.entries(options)) {
                formFieldsHTML += `<option value="${optValue}" ${String(optValue) === String(value) ? 'selected' : ''}>${optLabel}</option>`;
            }
            formFieldsHTML += '</select>';
        } else if (field.type === 'multicheck') {
            formFieldsHTML += '<div class="checkbox-group">';
            const selectedValues = Array.isArray(value) ? value : [];
            for (const [optValue, optLabel] of Object.entries(field.options)) {
                formFieldsHTML += `<label><input type="checkbox" name="field-${key}" value="${optValue}" ${selectedValues.includes(optValue) ? 'checked' : ''}> ${optLabel}</label>`;
            }
            formFieldsHTML += '</div>';
        } else {
            formFieldsHTML += `<input type="${field.type}" id="field-${key}" value="${value}" ${field.required ? 'required' : ''} ${field.step ? `step="${field.step}"` : ''}>`;
        }
        formFieldsHTML += '</div>';
    }

    const modalHTML = `
        <div id="edit-modal" class="modal-overlay">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="closeModal()">&times;</button>
                </div>
                <form id="edit-form">
                    ${formFieldsHTML}
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Guardar</button>
                        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
                    </div>
                </form>
            </div>
        </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    document.getElementById('edit-form').addEventListener('submit', (e) => handleSaveItem(e, sectionKey, itemId));
}

async function handleSaveItem(e, sectionKey, itemId) {
    e.preventDefault();
    const config = SECTIONS_CONFIG[sectionKey];
    const isEdit = itemId !== null;

    const body = {};
    for (const [key, field] of Object.entries(config.fields)) {
        if (field.type === 'multicheck') {
            body[key] = Array.from(document.querySelectorAll(`input[name='field-${key}']:checked`)).map(el => el.value);
        } else {
            const value = document.getElementById(`field-${key}`).value;
            body[key] = field.type === 'number' ? parseFloat(value) : value;
        }
    }

    try {
        const response = await fetch(isEdit ? `${config.endpoint}/${itemId}` : config.endpoint, {
            method: isEdit ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo guardar.');
        
        showNotification(`${config.singular} guardada con éxito.`, 'success');
        closeModal();
        loadGenericAdminSection(sectionKey);

    } catch (error) {
        showNotification(error.message, 'error');
    }
}

async function handleDeleteItem(sectionKey, itemId) {
    const config = SECTIONS_CONFIG[sectionKey];
    if (!confirm(`¿Estás seguro de que quieres eliminar esta ${config.singular.toLowerCase()}?`)) return;

    try {
        const response = await fetch(`${config.endpoint}/${itemId}`, { method: 'DELETE' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'No se pudo eliminar.');
        }
        showNotification(`${config.singular} eliminada.`, 'success');
        loadGenericAdminSection(sectionKey);
    } catch (error) {
        showNotification(error.message, 'error');
    }
}

// --- Specific Loaders for Generic Sections ---
function loadRoutesAdmin() { loadGenericAdminSection('routes'); }
function loadBusesAdmin() { loadGenericAdminSection('buses'); }
function loadSchedulesAdmin() { loadGenericAdminSection('schedules'); }

// --- UTILITY FUNCTIONS ---

function getLoaderHTML(message) {
    return `<div class="loader"><i class="fas fa-spinner fa-spin"></i><p>${message}</p></div>`;
}

function getErrorHTML(message) {
    return `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>${message}</p></div>`;
}

function closeModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.remove();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}
