document.addEventListener('DOMContentLoaded', async () => {
    // --- Responsive Sidebar --- 
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target) && 
                sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
    }
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
        case 'buses': loadBuses(); break;
        case 'schedules': loadSchedules(); break;
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
                    <div class="form-group"><label for="distance_km">Distancia (km)</label><input type="number" id="distance_km" min="1" placeholder="100" required></div>
                    <div class="form-group"><label for="base_price">Precio Base ($)</label><input type="number" id="base_price" min="0" step="0.01" placeholder="200.00" required></div>
                    <button type="submit">Añadir Ruta</button>
                </form>
            </div>
            <table class="admin-table">
                <thead><tr><th>Origen</th><th>Destino</th><th>Distancia (km)</th><th>Precio Base</th><th>Acciones</th></tr></thead>
                <tbody>`;
        
        if (routes.length === 0) {
            contentHTML += '<tr><td colspan="5" style="text-align: center;">No hay rutas definidas.</td></tr>';
        } else {
            routes.forEach(route => {
                contentHTML += `
                    <tr data-id="${route.id}">
                        <td data-label="origin">${route.origin}</td>
                        <td data-label="destination">${route.destination}</td>
                        <td data-label="distance">${route.distance_km || 'N/A'} km</td>
                        <td data-label="price">$${route.base_price || 'N/A'}</td>
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
    const distance_km = document.getElementById('distance_km').value;
    const base_price = document.getElementById('base_price').value;
    try {
        const response = await fetch('/api/admin/routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination, distance_km: parseInt(distance_km), base_price: parseFloat(base_price) })
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

async function loadBuses() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Cargando autobuses...</p>';
    
    try {
        const response = await fetch('/api/buses');
        if (!response.ok) throw new Error('No se pudieron cargar los autobuses.');
        const buses = await response.json();
        
        let tableHTML = `
            <div class="section-header">
                <button class="btn btn-primary" onclick="showAddBusForm()">
                    <i class="fas fa-plus"></i> Agregar Autobús
                </button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Número de Bus</th>
                        <th>Tipo</th>
                        <th>Capacidad</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
        
        buses.forEach(bus => {
            tableHTML += `
                <tr>
                    <td>${bus.id}</td>
                    <td>${bus.bus_number}</td>
                    <td>${bus.type || 'N/A'}</td>
                    <td>${bus.capacity} asientos</td>
                    <td><span class="status-badge ${bus.status}">${bus.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button class="btn btn-secondary" onclick="editBus(${bus.id})">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn btn-danger" onclick="deleteBus(${bus.id})">
                            <i class="fas fa-trash"></i> Eliminar
                        </button>
                    </td>
                </tr>`;
        });
        
        tableHTML += `
                </tbody>
            </table>
            
            <!-- Modal para agregar/editar autobús -->
            <div id="busModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <span class="modal-close" onclick="closeBusModal()">&times;</span>
                    <h3 id="busModalTitle">Agregar Autobús</h3>
                    <form id="busForm" class="admin-form">
                        <div class="form-group">
                            <label for="busNumber">Número de Autobús:</label>
                            <input type="text" id="busNumber" required>
                        </div>
                        <div class="form-group">
                            <label for="busType">Tipo de Autobús:</label>
                            <select id="busType" required>
                                <option value="">Seleccionar tipo</option>
                                <option value="economico">Económico</option>
                                <option value="primera_clase">Primera Clase</option>
                                <option value="ejecutivo">Ejecutivo</option>
                                <option value="lujo">Lujo</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="busCapacity">Capacidad:</label>
                            <input type="number" id="busCapacity" min="1" max="60" required>
                        </div>
                        <div class="form-group">
                            <label for="busStatus">Estado:</label>
                            <select id="busStatus" required>
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                            </select>
                        </div>
                        <button type="submit">Guardar</button>
                    </form>
                </div>
            </div>`;
        
        content.innerHTML = tableHTML;
        setupBusFormHandlers();
        
    } catch (error) {
        content.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

function showAddBusForm() {
    document.getElementById('busModalTitle').textContent = 'Agregar Autobús';
    document.getElementById('busForm').reset();
    document.getElementById('busForm').removeAttribute('data-bus-id');
    document.getElementById('busModal').style.display = 'flex';
}

async function editBus(busId) {
    try {
        const response = await fetch(`/api/buses/${busId}`);
        if (!response.ok) throw new Error('No se pudo cargar el autobús.');
        const bus = await response.json();
        
        document.getElementById('busModalTitle').textContent = 'Editar Autobús';
        document.getElementById('busNumber').value = bus.bus_number;
        document.getElementById('busType').value = bus.type || '';
        document.getElementById('busCapacity').value = bus.capacity;
        document.getElementById('busStatus').value = bus.status;
        document.getElementById('busForm').setAttribute('data-bus-id', busId);
        document.getElementById('busModal').style.display = 'flex';
        
    } catch (error) {
        alert('Error al cargar el autobús: ' + error.message);
    }
}

async function deleteBus(busId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este autobús?')) return;
    
    try {
        const response = await fetch(`/api/buses/${busId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('No se pudo eliminar el autobús.');
        loadBuses(); // Recargar la lista
        alert('Autobús eliminado exitosamente.');
    } catch (error) {
        alert('Error al eliminar el autobús: ' + error.message);
    }
}

function closeBusModal() {
    document.getElementById('busModal').style.display = 'none';
}

function setupBusFormHandlers() {
    const form = document.getElementById('busForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const busData = {
            bus_number: document.getElementById('busNumber').value,
            type: document.getElementById('busType').value,
            capacity: parseInt(document.getElementById('busCapacity').value),
            status: document.getElementById('busStatus').value
        };
        
        const busId = form.getAttribute('data-bus-id');
        const isEdit = !!busId;
        
        try {
            const response = await fetch(
                isEdit ? `/api/buses/${busId}` : '/api/buses',
                {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(busData)
                }
            );
            
            if (!response.ok) throw new Error('No se pudo guardar el autobús.');
            
            closeBusModal();
            loadBuses(); // Recargar la lista
            alert(isEdit ? 'Autobús actualizado exitosamente.' : 'Autobús agregado exitosamente.');
            
        } catch (error) {
            alert('Error al guardar el autobús: ' + error.message);
        }
    });
}

// --- FUNCIONES PARA GESTIÓN DE HORARIOS ---

async function loadSchedules() {
    const content = document.getElementById('admin-content');
    content.innerHTML = '<p>Cargando horarios...</p>';
    
    try {
        // Cargar datos necesarios para los formularios
        const [schedulesRes, routesRes, busesRes] = await Promise.all([
            fetch('/api/admin/schedules'),
            fetch('/api/admin/routes'),
            fetch('/api/buses')
        ]);
        
        if (!schedulesRes.ok || !routesRes.ok || !busesRes.ok) {
            throw new Error('No se pudieron cargar los datos necesarios.');
        }
        
        const schedules = await schedulesRes.json();
        const routes = await routesRes.json();
        const buses = await busesRes.json();
        
        let tableHTML = `
            <div class="section-header">
                <button class="btn btn-primary" onclick="showAddScheduleForm()">
                    <i class="fas fa-plus"></i> Agregar Horario
                </button>
            </div>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Ruta</th>
                        <th>Autobús</th>
                        <th>Hora Salida</th>
                        <th>Hora Llegada</th>
                        <th>Multiplicador</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>`;
        
        if (schedules.length === 0) {
            tableHTML += '<tr><td colspan="8" style="text-align: center;">No hay horarios definidos.</td></tr>';
        } else {
            schedules.forEach(schedule => {
                tableHTML += `
                    <tr>
                        <td>${schedule.id}</td>
                        <td>${schedule.origin} → ${schedule.destination}</td>
                        <td>Bus ${schedule.bus_number}</td>
                        <td>${schedule.departure_time}</td>
                        <td>${schedule.arrival_time}</td>
                        <td>x${schedule.price_multiplier}</td>
                        <td><span class="status-badge ${schedule.status}">${schedule.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
                        <td>
                            <button class="btn btn-secondary" onclick="editSchedule(${schedule.id})">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-danger" onclick="deleteSchedule(${schedule.id})">
                                <i class="fas fa-trash"></i> Eliminar
                            </button>
                        </td>
                    </tr>`;
            });
        }
        
        tableHTML += `
                </tbody>
            </table>
            
            <!-- Modal para agregar/editar horario -->
            <div id="scheduleModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <span class="modal-close" onclick="closeScheduleModal()">&times;</span>
                    <h3 id="scheduleModalTitle">Agregar Horario</h3>
                    <form id="scheduleForm" class="admin-form">
                        <div class="form-group">
                            <label for="scheduleRoute">Ruta:</label>
                            <select id="scheduleRoute" required>
                                <option value="">Seleccionar ruta</option>
                                ${routes.map(route => `<option value="${route.id}">${route.origin} → ${route.destination}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="scheduleBus">Autobús:</label>
                            <select id="scheduleBus" required>
                                <option value="">Seleccionar autobús</option>
                                ${buses.filter(bus => bus.status === 'active').map(bus => `<option value="${bus.id}">Bus ${bus.bus_number} (${bus.capacity} asientos)</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="departureTime">Hora de Salida:</label>
                            <input type="time" id="departureTime" required>
                        </div>
                        <div class="form-group">
                            <label for="arrivalTime">Hora de Llegada:</label>
                            <input type="time" id="arrivalTime" required>
                        </div>
                        <div class="form-group">
                            <label for="scheduleDays">Días de la Semana:</label>
                            <div class="checkbox-group">
                                <label><input type="checkbox" value="monday"> Lunes</label>
                                <label><input type="checkbox" value="tuesday"> Martes</label>
                                <label><input type="checkbox" value="wednesday"> Miércoles</label>
                                <label><input type="checkbox" value="thursday"> Jueves</label>
                                <label><input type="checkbox" value="friday"> Viernes</label>
                                <label><input type="checkbox" value="saturday"> Sábado</label>
                                <label><input type="checkbox" value="sunday"> Domingo</label>
                                <label><input type="checkbox" value="daily"> Diario</label>
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="priceMultiplier">Multiplicador de Precio:</label>
                            <input type="number" id="priceMultiplier" min="0.1" max="3.0" step="0.1" value="1.0" required>
                            <small>1.0 = precio normal, 1.5 = 50% más caro</small>
                        </div>
                        <div class="form-group">
                            <label for="scheduleStatus">Estado:</label>
                            <select id="scheduleStatus" required>
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                            </select>
                        </div>
                        <button type="submit">Guardar</button>
                    </form>
                </div>
            </div>`;
        
        content.innerHTML = tableHTML;
        setupScheduleFormHandlers();
        
    } catch (error) {
        content.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

function showAddScheduleForm() {
    document.getElementById('scheduleModalTitle').textContent = 'Agregar Horario';
    document.getElementById('scheduleForm').reset();
    document.getElementById('scheduleForm').removeAttribute('data-schedule-id');
    document.getElementById('scheduleModal').style.display = 'flex';
}

async function editSchedule(scheduleId) {
    try {
        const response = await fetch(`/api/admin/schedules/${scheduleId}`);
        if (!response.ok) throw new Error('No se pudo cargar el horario.');
        const schedule = await response.json();
        
        document.getElementById('scheduleModalTitle').textContent = 'Editar Horario';
        document.getElementById('scheduleRoute').value = schedule.route_id;
        document.getElementById('scheduleBus').value = schedule.bus_id;
        document.getElementById('departureTime').value = schedule.departure_time;
        document.getElementById('arrivalTime').value = schedule.arrival_time;
        document.getElementById('schedulePrice').value = schedule.base_price;
        document.getElementById('scheduleStatus').value = schedule.status;
        document.getElementById('scheduleForm').setAttribute('data-schedule-id', scheduleId);
        document.getElementById('scheduleModal').style.display = 'flex';
        
    } catch (error) {
        alert('Error al cargar el horario: ' + error.message);
    }
}

async function deleteSchedule(scheduleId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este horario?')) return;
    
    try {
        const response = await fetch(`/api/admin/schedules/${scheduleId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('No se pudo eliminar el horario.');
        loadSchedules(); // Recargar la lista
        alert('Horario eliminado exitosamente.');
    } catch (error) {
        alert('Error al eliminar el horario: ' + error.message);
    }
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').style.display = 'none';
}

function setupScheduleFormHandlers() {
    const form = document.getElementById('scheduleForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const daysOfWeekCheckboxes = document.querySelectorAll('#scheduleForm .checkbox-group input:checked');
        const days_of_week = Array.from(daysOfWeekCheckboxes).map(cb => cb.value);

        const scheduleData = {
            route_id: parseInt(document.getElementById('scheduleRoute').value),
            bus_id: parseInt(document.getElementById('scheduleBus').value),
            departure_time: document.getElementById('departureTime').value,
            arrival_time: document.getElementById('arrivalTime').value,
            days_of_week: days_of_week,
            price_multiplier: parseFloat(document.getElementById('priceMultiplier').value),
            status: document.getElementById('scheduleStatus').value
        };
        
        const scheduleId = form.getAttribute('data-schedule-id');
        const isEdit = !!scheduleId;
        
        try {
            const response = await fetch(
                isEdit ? `/api/admin/schedules/${scheduleId}` : '/api/admin/schedules',
                {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(scheduleData)
                }
            );
            
            if (!response.ok) throw new Error('No se pudo guardar el horario.');
            
            closeScheduleModal();
            loadSchedules(); // Recargar la lista
            alert(isEdit ? 'Horario actualizado exitosamente.' : 'Horario agregado exitosamente.');
            
        } catch (error) {
            alert('Error al guardar el horario: ' + error.message);
        }
    });
}

function renderPlaceholder(sectionName) {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <div class="placeholder-section">
            <h2>Sección de ${sectionName}</h2>
            <p>Esta sección está lista para ser desarrollada.</p>
        </div>
    `;
}
