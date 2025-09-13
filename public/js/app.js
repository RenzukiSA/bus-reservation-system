// Global state
let currentSchedules = [];
let selectedSchedule = null;
let selectedSeats = [];
let seatMap = [];
let reservationType = 'seats';
let countdownTimer = null;

// API Base URL
const API_BASE = '/api';

// DOM Elements
const searchForm = document.getElementById('searchForm');
const originSelect = document.getElementById('origin');
const destinationSelect = document.getElementById('destination');
const travelDateInput = document.getElementById('travelDate');
const loading = document.getElementById('loading');
const searchResults = document.getElementById('searchResults');
const schedulesList = document.getElementById('schedulesList');
const seatSelection = document.getElementById('seatSelection');
const seatMapContainer = document.getElementById('seatMap');
const reservationForm = document.getElementById('reservationForm');
const paymentInstructions = document.getElementById('paymentInstructions');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadRoutes();
    setMinDate();
});

function initializeApp() {
    // Show home section by default
    showSection('home');
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', async function(e) {
            e.preventDefault();
            const sectionId = this.getAttribute('href').substring(1);

            if (sectionId === 'admin') {
                const isAdmin = await checkAuthStatus();
                if (isAdmin) {
                    showSection('admin');
                } else {
                    document.getElementById('adminLoginModal').classList.remove('hidden');
                }
            } else {
                showSection(sectionId);
            }
            
            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Search form
    searchForm.addEventListener('submit', handleSearch);

    // Admin Login Form
    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);

    // Origin change
    originSelect.addEventListener('change', updateDestinations);

    // Reservation type change
    document.querySelectorAll('input[name="reservationType"]').forEach(radio => {
        radio.addEventListener('change', function() {
            reservationType = this.value;
            updateSeatSelection();
        });
    });

    // Back to results
    document.getElementById('backToResults').addEventListener('click', function() {
        seatSelection.classList.add('hidden');
        searchResults.classList.remove('hidden');
    });

    // Proceed to reservation
    document.getElementById('proceedToReservation').addEventListener('click', function() {
        if (reservationType === 'seats' && selectedSeats.length === 0) {
            alert('Por favor selecciona al menos un asiento');
            return;
        }
        showReservationForm();
    });

    // Customer form
    document.getElementById('customerForm').addEventListener('submit', handleReservation);

    // Reservation search
    document.getElementById('reservationSearchForm').addEventListener('submit', handleReservationSearch);

    // Admin tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            showAdminTab(tab);
        });
    });

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
}

function setMinDate() {
    const today = new Date().toISOString().split('T')[0];
    travelDateInput.min = today;
    travelDateInput.value = today;
}

async function loadRoutes() {
    try {
        const response = await fetch(`${API_BASE}/buses/routes`);
        const routes = await response.json();
        
        // Populate origin select
        originSelect.innerHTML = '<option value="">Selecciona origen</option>';
        Object.keys(routes).forEach(origin => {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            originSelect.appendChild(option);
        });
        
        // Store routes for destination updates
        window.routesData = routes;
    } catch (error) {
        console.error('Error loading routes:', error);
        showError('Error al cargar las rutas disponibles');
    }
}

function updateDestinations() {
    const selectedOrigin = originSelect.value;
    destinationSelect.innerHTML = '<option value="">Selecciona destino</option>';
    
    if (selectedOrigin && window.routesData[selectedOrigin]) {
        window.routesData[selectedOrigin].forEach(destination => {
            const option = document.createElement('option');
            option.value = destination;
            option.textContent = destination;
            destinationSelect.appendChild(option);
        });
    }
}

async function handleSearch(e) {
    e.preventDefault();
    
    const origin = originSelect.value;
    const destination = destinationSelect.value;
    const date = travelDateInput.value;
    
    if (!origin || !destination || !date) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    showLoading();
    
    try {
        const url = `${API_BASE}/buses/schedules?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${date}`;
        console.log('🔍 Searching with URL:', url);
        
        const response = await fetch(url);
        console.log('📡 Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const schedules = await response.json();
        console.log('📋 Schedules received:', schedules);
        
        hideLoading();
        
        if (!Array.isArray(schedules)) {
            console.error('Invalid response format:', schedules);
            showError('Error en el formato de respuesta del servidor');
            return;
        }
        
        currentSchedules = schedules;
        
        if (schedules.length === 0) {
            showError('No se encontraron viajes disponibles para la fecha seleccionada');
        } else {
            displaySchedules(schedules);
        }
    } catch (error) {
        console.error('Error searching schedules:', error);
        hideLoading();
        showError('Error al buscar viajes disponibles');
    }
}

function displaySchedules(schedules) {
    schedulesList.innerHTML = '';
    
    schedules.forEach(schedule => {
        const card = document.createElement('div');
        card.className = 'schedule-card';
        
        const availabilityText = schedule.is_full_bus_available ? 
            'Autobús completo disponible' : 
            `${schedule.available_seats} asientos disponibles`;
        
        card.innerHTML = `
            <div class="schedule-header">
                <div class="schedule-time">
                    <span>${schedule.departure_time}</span>
                    <i class="fas fa-arrow-right"></i>
                    <span>${schedule.arrival_time}</span>
                </div>
                <div class="bus-type">${schedule.bus_type.replace('_', ' ').toUpperCase()}</div>
            </div>
            <div class="schedule-info">
                <div class="info-item">
                    <div class="label">Autobús</div>
                    <div class="value">${schedule.bus_number}</div>
                </div>
                <div class="info-item">
                    <div class="label">Disponibilidad</div>
                    <div class="value">${availabilityText}</div>
                </div>
                <div class="info-item">
                    <div class="label">Precio por asiento</div>
                    <div class="value">$${schedule.base_total_price}</div>
                </div>
                <div class="info-item">
                    <div class="label">Autobús completo</div>
                    <div class="value">$${schedule.full_bus_price}</div>
                </div>
            </div>
            <div class="schedule-actions">
                <button class="btn btn-primary" onclick="selectSchedule(${schedule.schedule_id})" 
                        ${schedule.available_seats === 0 && !schedule.is_full_bus_available ? 'disabled' : ''}>
                    <i class="fas fa-chair"></i> Seleccionar Asientos
                </button>
            </div>
        `;
        
        schedulesList.appendChild(card);
    });
    
    searchResults.classList.remove('hidden');
}

async function selectSchedule(scheduleId) {
    selectedSchedule = currentSchedules.find(s => s.schedule_id === scheduleId);
    
    if (!selectedSchedule) {
        showError('Error al seleccionar el horario');
        return;
    }
    
    // Update schedule info display
    document.getElementById('selectedScheduleInfo').textContent = 
        `${selectedSchedule.departure_time} - ${selectedSchedule.arrival_time} | ${selectedSchedule.bus_number}`;
    
    // Load seat map
    await loadSeatMap(scheduleId);
    
    // Show seat selection
    searchResults.classList.add('hidden');
    seatSelection.classList.remove('hidden');
}

async function loadSeatMap(scheduleId) {
    try {
        const date = travelDateInput.value;
        const response = await fetch(`${API_BASE}/buses/seats/${scheduleId}?date=${date}`);
        const data = await response.json();
        
        seatMap = data.seats;
        displaySeatMap(data.seats, data.has_full_bus_reservation);
        
        // Update reservation options based on availability
        const fullBusRadio = document.getElementById('reserveFullBus');
        if (data.has_full_bus_reservation || data.seats.some(seat => !seat.is_available)) {
            fullBusRadio.disabled = true;
            fullBusRadio.parentElement.style.opacity = '0.5';
            document.getElementById('reserveSeats').checked = true;
            reservationType = 'seats';
        } else {
            fullBusRadio.disabled = false;
            fullBusRadio.parentElement.style.opacity = '1';
        }
        
    } catch (error) {
        console.error('Error loading seat map:', error);
        showError('Error al cargar el mapa de asientos');
    }
}

function displaySeatMap(seats, hasFullBusReservation) {
    seatMapContainer.innerHTML = '';
    selectedSeats = [];
    
    seats.forEach(seat => {
        const seatElement = document.createElement('div');
        seatElement.className = 'seat';
        seatElement.textContent = seat.seat_number;
        seatElement.dataset.seatId = seat.id;
        
        if (hasFullBusReservation || !seat.is_available) {
            seatElement.classList.add('occupied');
        } else {
            seatElement.classList.add('available');
            if (seat.seat_type === 'premium') {
                seatElement.classList.add('premium');
            }
            
            seatElement.addEventListener('click', function() {
                if (reservationType === 'seats') {
                    toggleSeat(seat.id, seatElement);
                }
            });
        }
        
        seatMapContainer.appendChild(seatElement);
    });
    
    updatePriceSummary();
}

function toggleSeat(seatId, seatElement) {
    const index = selectedSeats.indexOf(seatId);
    
    if (index > -1) {
        // Deselect seat
        selectedSeats.splice(index, 1);
        seatElement.classList.remove('selected');
    } else {
        // Select seat
        selectedSeats.push(seatId);
        seatElement.classList.add('selected');
    }
    
    updatePriceSummary();
}

function updateSeatSelection() {
    if (reservationType === 'full_bus') {
        // Select all available seats visually
        document.querySelectorAll('.seat.available').forEach(seat => {
            seat.classList.add('selected');
        });
        selectedSeats = seatMap.filter(seat => seat.is_available).map(seat => seat.id);
    } else {
        // Clear all selections
        document.querySelectorAll('.seat').forEach(seat => {
            seat.classList.remove('selected');
        });
        selectedSeats = [];
    }
    
    updatePriceSummary();
}

function updatePriceSummary() {
    const selectedSeatsCount = document.getElementById('selectedSeatsCount');
    const selectedSeatsList = document.getElementById('selectedSeatsList');
    const totalPrice = document.getElementById('totalPrice');
    const proceedBtn = document.getElementById('proceedToReservation');
    
    if (reservationType === 'full_bus') {
        selectedSeatsCount.textContent = 'Autobús completo';
        selectedSeatsList.innerHTML = '<p>Reserva de autobús completo</p>';
        totalPrice.textContent = selectedSchedule.full_bus_price;
        proceedBtn.disabled = false;
    } else {
        selectedSeatsCount.textContent = selectedSeats.length;
        
        if (selectedSeats.length > 0) {
            const seatNumbers = selectedSeats.map(seatId => {
                const seat = seatMap.find(s => s.id === seatId);
                return seat ? seat.seat_number : '';
            }).filter(Boolean);
            
            selectedSeatsList.innerHTML = `<p>Asientos: ${seatNumbers.join(', ')}</p>`;
            
            // Calculate total price
            let total = 0;
            selectedSeats.forEach(seatId => {
                const seat = seatMap.find(s => s.id === seatId);
                if (seat) {
                    total += parseFloat(selectedSchedule.base_total_price) * seat.price_modifier;
                }
            });
            
            totalPrice.textContent = total.toFixed(2);
            proceedBtn.disabled = false;
        } else {
            selectedSeatsList.innerHTML = '<p>No hay asientos seleccionados</p>';
            totalPrice.textContent = '0.00';
            proceedBtn.disabled = true;
        }
    }
}

function showReservationForm() {
    // Update reservation summary
    const summaryDiv = document.getElementById('reservationSummary');
    const origin = originSelect.value;
    const destination = destinationSelect.value;
    const date = travelDateInput.value;
    
    const seatInfo = reservationType === 'full_bus' ? 
        'Autobús completo' : 
        `${selectedSeats.length} asiento(s)`;
    
    summaryDiv.innerHTML = `
        <div class="summary-item"><strong>Ruta:</strong> ${origin} → ${destination}</div>
        <div class="summary-item"><strong>Fecha:</strong> ${new Date(date).toLocaleDateString('es-ES')}</div>
        <div class="summary-item"><strong>Horario:</strong> ${selectedSchedule.departure_time} - ${selectedSchedule.arrival_time}</div>
        <div class="summary-item"><strong>Autobús:</strong> ${selectedSchedule.bus_number}</div>
        <div class="summary-item"><strong>Reserva:</strong> ${seatInfo}</div>
        <div class="summary-item"><strong>Total:</strong> $${document.getElementById('totalPrice').textContent}</div>
    `;
    
    seatSelection.classList.add('hidden');
    reservationForm.classList.remove('hidden');
}

async function handleReservation(e) {
    e.preventDefault();
    
    const customerName = document.getElementById('customerName').value;
    const customerPhone = document.getElementById('customerPhone').value;
    const customerEmail = document.getElementById('customerEmail').value;
    
    const reservationData = {
        schedule_id: selectedSchedule.schedule_id,
        reservation_date: travelDateInput.value,
        reservation_type: reservationType,
        selected_seats: reservationType === 'seats' ? selectedSeats : null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail
    };
    
    try {
        const response = await fetch(`${API_BASE}/reservations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(reservationData)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showPaymentInstructions(result);
        } else {
            showError(result.error || 'Error al crear la reserva');
        }
    } catch (error) {
        console.error('Error creating reservation:', error);
        showError('Error al procesar la reserva');
    }
}

function showPaymentInstructions(data) {
    const whatsappNumberClean = data.whatsapp_number.replace(/[^0-9]/g, ''); // Clean the number
    const whatsappMessage = `Hola, quiero confirmar mi reserva con ID: ${data.reservation_id}`;
    const whatsappLink = `https://wa.me/${whatsappNumberClean}?text=${encodeURIComponent(whatsappMessage)}`;

    const instructionsHTML = `
        <h2>Instrucciones de Pago</h2>
        <div class="card">
            <div class="card-header">
                <h3>¡Reserva Creada!</h3>
                <div id="countdown-container">
                    <p>Tiempo restante para pagar:</p>
                    <div id="countdown">15:00</div>
                </div>
            </div>
            <div class="card-body">
                <p>Tu reserva con ID <strong id="reservationId">${data.reservation_id}</strong> ha sido creada.</p>
                <p>Total a pagar: <strong>$${data.total_price}</strong></p>
                <p>Tienes hasta las <strong id="paymentDeadline">${new Date(data.payment_deadline).toLocaleString('es-ES')}</strong> para completar el pago.</p>
                <hr>
                <h5>Instrucciones de Pago</h5>
                <p>Por favor, envía tu comprobante de pago a nuestro número de WhatsApp para confirmar tu reserva.</p>
                <a id="whatsappLink" href="${whatsappLink}" target="_blank" class="btn btn-success">
                    <i class="fab fa-whatsapp"></i> Enviar Comprobante por WhatsApp
                </a>
                <p class="small-text">Número: ${data.whatsapp_number}</p>
            </div>
        </div>
    `;

    paymentInstructions.innerHTML = instructionsHTML;

    // Start countdown timer
    startCountdown(new Date(data.payment_deadline));

    reservationForm.classList.add('hidden');
    paymentInstructions.classList.remove('hidden');
}

function startCountdown(deadline) {
    const countdownElement = document.getElementById('countdown');
    
    countdownTimer = setInterval(() => {
        const now = new Date().getTime();
        const distance = deadline.getTime() - now;
        
        if (distance < 0) {
            clearInterval(countdownTimer);
            countdownElement.textContent = 'EXPIRADO';
            countdownElement.parentElement.style.background = '#f8d7da';
            countdownElement.parentElement.style.color = '#721c24';
            return;
        }
        
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

async function handleReservationSearch(e) {
    e.preventDefault();
    
    const reservationId = document.getElementById('searchReservationId').value;
    
    try {
        const response = await fetch(`${API_BASE}/reservations/${reservationId}`);
        
        if (response.ok) {
            const reservation = await response.json();
            displayReservationDetails(reservation);
        } else {
            showError('Reserva no encontrada');
        }
    } catch (error) {
        console.error('Error searching reservation:', error);
        showError('Error al buscar la reserva');
    }
}

function displayReservationDetails(reservation) {
    const detailsDiv = document.getElementById('reservationDetails');
    
    const statusColors = {
        'pending': 'orange',
        'confirmed': 'green',
        'cancelled': 'red',
        'expired': 'gray'
    };
    
    const statusTexts = {
        'pending': 'Pendiente de pago',
        'confirmed': 'Confirmada',
        'cancelled': 'Cancelada',
        'expired': 'Expirada'
    };
    
    const seatInfo = reservation.reservation_type === 'full_bus' ? 
        'Autobús completo' : 
        (reservation.seats ? reservation.seats.map(s => s.seat_number).join(', ') : 'N/A');
    
    detailsDiv.innerHTML = `
        <div class="reservation-card">
            <div class="reservation-header">
                <h3>Reserva ${reservation.id}</h3>
                <span class="status" style="color: ${statusColors[reservation.status]}">
                    ${statusTexts[reservation.status]}
                </span>
            </div>
            <div class="reservation-info">
                <div class="info-row">
                    <strong>Ruta:</strong> ${reservation.origin} → ${reservation.destination}
                </div>
                <div class="info-row">
                    <strong>Fecha:</strong> ${new Date(reservation.reservation_date).toLocaleDateString('es-ES')}
                </div>
                <div class="info-row">
                    <strong>Horario:</strong> ${reservation.departure_time} - ${reservation.arrival_time}
                </div>
                <div class="info-row">
                    <strong>Autobús:</strong> ${reservation.bus_number} (${reservation.bus_type})
                </div>
                <div class="info-row">
                    <strong>Asientos:</strong> ${seatInfo}
                </div>
                <div class="info-row">
                    <strong>Pasajero:</strong> ${reservation.customer_name}
                </div>
                <div class="info-row">
                    <strong>Teléfono:</strong> ${reservation.customer_phone}
                </div>
                <div class="info-row">
                    <strong>Total:</strong> $${reservation.total_price}
                </div>
                <div class="info-row">
                    <strong>Creada:</strong> ${new Date(reservation.created_at).toLocaleString('es-ES')}
                </div>
            </div>
        </div>
    `;
    
    detailsDiv.classList.remove('hidden');
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    // Load admin data if admin section is shown
    if (sectionId === 'admin') {
        loadAdminDashboard();
        addLogoutButton();
    } else {
        removeLogoutButton();
    }
}

function showAdminTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    // Load specific admin data
    switch(tabId) {
        case 'dashboard':
            loadAdminDashboard();
            break;
        case 'reservations-admin':
            loadAdminReservations();
            break;
        case 'routes-admin':
            loadAdminRoutes();
            break;
        case 'buses-admin':
            loadAdminBuses();
            break;
    }
}

async function loadAdminDashboard() {
    try {
        const response = await fetch(`${API_BASE}/admin/dashboard`);
        const data = await response.json();
        
        const statsDiv = document.getElementById('dashboardStats');
        statsDiv.innerHTML = `
            <div class="stat-card">
                <i class="fas fa-ticket-alt" style="color: #3498db;"></i>
                <h3>${data.reservations_by_status.reduce((sum, item) => sum + item.count, 0)}</h3>
                <p>Total Reservas</p>
            </div>
            <div class="stat-card">
                <i class="fas fa-check-circle" style="color: #27ae60;"></i>
                <h3>${data.reservations_by_status.find(item => item.status === 'confirmed')?.count || 0}</h3>
                <p>Confirmadas</p>
            </div>
            <div class="stat-card">
                <i class="fas fa-clock" style="color: #f39c12;"></i>
                <h3>${data.reservations_by_status.find(item => item.status === 'pending')?.count || 0}</h3>
                <p>Pendientes</p>
            </div>
            <div class="stat-card">
                <i class="fas fa-dollar-sign" style="color: #e74c3c;"></i>
                <h3>$${data.monthly_revenue[0]?.revenue || 0}</h3>
                <p>Ingresos del Mes</p>
            </div>
        `;
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadAdminReservations() {
    try {
        const response = await fetch(`${API_BASE}/admin/reservations`);
        const reservations = await response.json();
        
        const container = document.getElementById('adminReservations');
        
        if (reservations.length === 0) {
            container.innerHTML = `
                <div class="no-data">
                    <i class="fas fa-inbox"></i>
                    <p>No hay reservas registradas</p>
                    <small>Las reservas aparecerán aquí cuando los usuarios hagan reservaciones</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="admin-table-container">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Cliente</th>
                            <th>Ruta</th>
                            <th>Fecha</th>
                            <th>Total</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reservations.map(res => `
                            <tr>
                                <td><code>${res.id.substring(0, 8)}...</code></td>
                                <td>${res.customer_name}</td>
                                <td>${res.origin} → ${res.destination}</td>
                                <td>${new Date(res.reservation_date).toLocaleDateString('es-ES')}</td>
                                <td>$${res.total_price}</td>
                                <td><span class="status-badge status-${res.status}">${getStatusText(res.status)}</span></td>
                                <td>
                                    ${res.status === 'pending' ? 
                                        `<button class="btn btn-sm btn-success" onclick="confirmReservation('${res.id}')">Confirmar</button>` : 
                                        '-'
                                    }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error loading admin reservations:', error);
        const container = document.getElementById('adminReservations');
        container.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar las reservas</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

function getStatusText(status) {
    const statusTexts = {
        'pending': 'Pendiente',
        'confirmed': 'Confirmada',
        'cancelled': 'Cancelada',
        'expired': 'Expirada'
    };
    return statusTexts[status] || status;
}

async function loadAdminRoutes() {
    try {
        const response = await fetch(`${API_BASE}/admin/routes`);
        const routes = await response.json();
        
        const container = document.getElementById('adminRoutes');
        container.innerHTML = `
            <div class="admin-section">
                <div class="section-header">
                    <h3>Rutas Disponibles</h3>
                    <button class="btn btn-primary" onclick="showAddRouteForm()">
                        <i class="fas fa-plus"></i> Agregar Ruta
                    </button>
                </div>
                
                <div id="addRouteForm" class="form-card hidden">
                    <h4>Nueva Ruta</h4>
                    <form id="newRouteForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Origen</label>
                                <input type="text" id="newRouteOrigin" required>
                            </div>
                            <div class="form-group">
                                <label>Destino</label>
                                <input type="text" id="newRouteDestination" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Distancia (km)</label>
                                <input type="number" id="newRouteDistance" required>
                            </div>
                            <div class="form-group">
                                <label>Precio Base</label>
                                <input type="number" step="0.01" id="newRoutePrice" required>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">Guardar</button>
                            <button type="button" class="btn btn-secondary" onclick="hideAddRouteForm()">Cancelar</button>
                        </div>
                    </form>
                </div>

                <div class="admin-table-container">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Origen</th>
                                <th>Destino</th>
                                <th>Distancia</th>
                                <th>Precio Base</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${routes.map(route => `
                                <tr>
                                    <td>${route.id}</td>
                                    <td>${route.origin}</td>
                                    <td>${route.destination}</td>
                                    <td>${route.distance_km} km</td>
                                    <td>$${route.base_price}</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="editRoute(${route.id})">Editar</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Setup form handler
        document.getElementById('newRouteForm').addEventListener('submit', handleAddRoute);

        // Store routes globally for editing
        window.adminRoutes = routes;
    } catch (error) {
        console.error('Error loading routes:', error);
        const container = document.getElementById('adminRoutes');
        container.innerHTML = `<div class="error-message">Error al cargar rutas: ${error.message}</div>`;
    }
}

async function loadAdminBuses() {
    try {
        const response = await fetch(`${API_BASE}/admin/buses`);
        const buses = await response.json();
        
        const container = document.getElementById('adminBuses');
        container.innerHTML = `
            <div class="admin-section">
                <div class="section-header">
                    <h3>Flota de Autobuses</h3>
                    <button class="btn btn-primary" onclick="showAddBusForm()">
                        <i class="fas fa-plus"></i> Agregar Autobús
                    </button>
                </div>
                
                <div id="addBusForm" class="form-card hidden">
                    <h4>Nuevo Autobús</h4>
                    <form id="newBusForm">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Número de Autobús</label>
                                <input type="text" id="newBusNumber" required placeholder="BUS001">
                            </div>
                            <div class="form-group">
                                <label>Capacidad</label>
                                <input type="number" id="newBusCapacity" required min="20" max="60">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Tipo de Autobús</label>
                                <select id="newBusType" required>
                                    <option value="">Seleccionar tipo</option>
                                    <option value="ejecutivo">Ejecutivo</option>
                                    <option value="primera_clase">Primera Clase</option>
                                    <option value="economico">Económico</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Estado</label>
                                <select id="newBusStatus">
                                    <option value="active">Activo</option>
                                    <option value="maintenance">Mantenimiento</option>
                                    <option value="inactive">Inactivo</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">Guardar</button>
                            <button type="button" class="btn btn-secondary" onclick="hideAddBusForm()">Cancelar</button>
                        </div>
                    </form>
                </div>

                <div class="admin-table-container">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Número</th>
                                <th>Capacidad</th>
                                <th>Tipo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buses.map(bus => `
                                <tr>
                                    <td>${bus.id}</td>
                                    <td><strong>${bus.bus_number}</strong></td>
                                    <td>${bus.capacity} asientos</td>
                                    <td><span class="bus-type-badge ${bus.bus_type}">${bus.bus_type.replace('_', ' ').toUpperCase()}</span></td>
                                    <td><span class="status-badge status-${bus.status}">${bus.status}</span></td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="editBus(${bus.id})">Editar</button>
                                        <button class="btn btn-sm btn-warning" onclick="toggleBusStatus(${bus.id}, '${bus.status}')">
                                            ${bus.status === 'active' ? 'Desactivar' : 'Activar'}
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        // Setup form handler
        document.getElementById('newBusForm').addEventListener('submit', handleAddBus);
    } catch (error) {
        console.error('Error loading buses:', error);
        const container = document.getElementById('adminBuses');
        container.innerHTML = `<div class="error-message">Error al cargar autobuses: ${error.message}</div>`;
    }
}

async function confirmReservation(reservationId) {
    try {
        const response = await fetch(`${API_BASE}/reservations/${reservationId}/confirm`, {
            method: 'PUT'
        });
        
        if (response.ok) {
            showSuccess('Reserva confirmada exitosamente');
            loadAdminReservations(); // Reload the list
        } else {
            const error = await response.json();
            showError(error.error || 'Error al confirmar la reserva');
        }
    } catch (error) {
        console.error('Error confirming reservation:', error);
        showError('Error al confirmar la reserva');
    }
}

function showAddRouteForm() {
    document.getElementById('addRouteForm').classList.remove('hidden');
}

function hideAddRouteForm() {
    document.getElementById('addRouteForm').classList.add('hidden');
    document.getElementById('newRouteForm').reset();
}

function showAddBusForm() {
    document.getElementById('addBusForm').classList.remove('hidden');
}

function hideAddBusForm() {
    document.getElementById('addBusForm').classList.add('hidden');
    document.getElementById('newBusForm').reset();
}

async function handleAddRoute(e) {
    e.preventDefault();
    
    const routeData = {
        origin: document.getElementById('newRouteOrigin').value,
        destination: document.getElementById('newRouteDestination').value,
        distance_km: document.getElementById('newRouteDistance').value,
        base_price: document.getElementById('newRoutePrice').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/admin/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeData)
        });
        
        if (response.ok) {
            showSuccess('Ruta agregada exitosamente');
            hideAddRouteForm();
            loadAdminRoutes();
            loadRoutes(); // Refresh main routes dropdown
        } else {
            const error = await response.json();
            showError(error.error || 'Error al agregar ruta');
        }
    } catch (error) {
        showError('Error al agregar ruta');
    }
}

async function handleAddBus(e) {
    e.preventDefault();
    
    const busData = {
        bus_number: document.getElementById('newBusNumber').value,
        capacity: document.getElementById('newBusCapacity').value,
        bus_type: document.getElementById('newBusType').value,
        status: document.getElementById('newBusStatus').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/admin/buses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(busData)
        });
        
        if (response.ok) {
            showSuccess('Autobús agregado exitosamente');
            hideAddBusForm();
            loadAdminBuses();
        } else {
            const error = await response.json();
            showError(error.error || 'Error al agregar autobús');
        }
    } catch (error) {
        showError('Error al agregar autobús');
    }
}

function editRoute(routeId) {
    const route = window.adminRoutes.find(r => r.id === routeId);
    if (!route) {
        showError('No se pudo encontrar la ruta para editar');
        return;
    }

    // Populate the modal form
    document.getElementById('editRouteId').value = route.id;
    document.getElementById('editRouteOrigin').value = route.origin;
    document.getElementById('editRouteDestination').value = route.destination;
    document.getElementById('editRouteDistance').value = route.distance_km;
    document.getElementById('editRoutePrice').value = route.base_price;

    // Show the modal
    document.getElementById('editRouteModal').classList.remove('hidden');
}

function closeEditRouteModal() {
    document.getElementById('editRouteModal').classList.add('hidden');
}

document.getElementById('editRouteForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const routeId = document.getElementById('editRouteId').value;
    const updatedRoute = {
        origin: document.getElementById('editRouteOrigin').value,
        destination: document.getElementById('editRouteDestination').value,
        distance_km: document.getElementById('editRouteDistance').value,
        base_price: document.getElementById('editRoutePrice').value
    };

    try {
        const response = await fetch(`${API_BASE}/admin/routes/${routeId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedRoute)
        });

        const result = await response.json();

        if (response.ok) {
            showSuccess('Ruta actualizada exitosamente');
            closeEditRouteModal();
            loadAdminRoutes(); // Refresh the routes table
        } else {
            showError(result.error || 'Error al actualizar la ruta');
        }
    } catch (error) {
        console.error('Error updating route:', error);
        showError('Error de conexión al actualizar la ruta');
    }
});

function editBus(busId) {
    showModal(`<p>Función de editar autobús en desarrollo. ID: ${busId}</p>`);
}

function toggleBusStatus(busId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    showModal(`<p>Función de cambiar estado en desarrollo. Bus ID: ${busId}, Nuevo estado: ${newStatus}</p>`);
}

function showModal(content) {
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

function showLoading() {
    loading.classList.remove('hidden');
    searchResults.classList.add('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(`Éxito: ${message}`);
}

async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/status`);
        const data = await response.json();
        return data.isAdmin;
    } catch (error) {
        console.error('Error checking auth status:', error);
        return false;
    }
}

async function handleAdminLogin(e) {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (response.ok) {
            document.getElementById('adminLoginModal').classList.add('hidden');
            showSection('admin');
        } else {
            errorEl.textContent = result.error || 'Error desconocido';
            errorEl.classList.remove('hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Error de conexión con el servidor.';
        errorEl.classList.remove('hidden');
    }
}

function addLogoutButton() {
    if (document.getElementById('logoutBtn')) return; // Avoid duplicates

    const logoutBtn = document.createElement('li');
    logoutBtn.className = 'nav-item';
    logoutBtn.innerHTML = `<a id="logoutBtn" class="nav-link" href="#">Cerrar Sesión</a>`;
    
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch(`${API_BASE}/logout`, { method: 'POST' });
            showSection('home');
            document.querySelector('a[href="#home"]').classList.add('active');
        } catch (error) {
            showError('No se pudo cerrar la sesión.');
        }
    });

    document.querySelector('.navbar-nav').appendChild(logoutBtn);
}

function removeLogoutButton() {
    const logoutBtn = document.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.parentElement.remove();
    }
}
