// Global state
let currentSchedules = [];
let selectedSchedule = null;
let selectedSeats = [];
let seatMap = [];
let reservationType = 'seats';
let countdownTimer = null;
let holdCountdownTimer = null;
let currentHold = null;

// --- View Controller ---
const views = document.querySelectorAll('[data-view]');

function setView(state) {
    views.forEach(view => {
        if (view.dataset.view === state) {
            view.classList.remove('is-hidden');
        } else {
            view.classList.add('is-hidden');
        }
    });
}

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
document.addEventListener('DOMContentLoaded', () => {
    // --- Responsive Sidebar Navigation --- 
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

    // --- Global State ---
    let currentSchedules = [];
    let selectedSchedule = null;
    let selectedSeats = [];
    let seatMap = [];
    let reservationType = 'seats';
    let countdownTimer = null;
    let holdCountdownTimer = null;
    let currentHold = null;

    // --- API ---
    const API_BASE = '/api';

    // --- DOM Elements ---
    const searchForm = document.getElementById('searchForm');
    const originSelect = document.getElementById('origin');
    const destinationSelect = document.getElementById('destination');
    const travelDateInput = document.getElementById('travelDate');
    const loading = document.getElementById('loading');
    const searchResults = document.getElementById('searchResults');
    const schedulesList = document.getElementById('schedulesList');
    const noResults = document.getElementById('noResults');
    const seatSelection = document.getElementById('seatSelection');
    const seatMapContainer = document.getElementById('seatMap');
    const reservationForm = document.getElementById('reservationForm');
    const paymentInstructions = document.getElementById('paymentInstructions');

    // --- View Controller ---
    const mainViews = document.querySelectorAll('[data-view]');
    const bookingSteps = [searchResults, seatSelection, reservationForm, paymentInstructions];

    function setView(viewName) {
        mainViews.forEach(view => {
            view.classList.toggle('is-hidden', view.dataset.view !== viewName);
        });
    }

    function setBookingStep(stepToShow) {
        bookingSteps.forEach(step => {
            step.classList.toggle('is-hidden', step !== stepToShow);
        });
    }

    // --- Initialization ---
    function initializeApp() {
        setupEventListeners();
        loadRoutes();
        setMinDate();
        setView('home');
        setBookingStep(null); // Hide all booking steps initially
        noResults.classList.remove('is-hidden');
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        // Main Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const viewName = this.getAttribute('href').substring(1);
                setView(viewName);
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                this.classList.add('active');
            });
        });

        // Search
        searchForm.addEventListener('submit', handleSearch);
        originSelect.addEventListener('change', updateDestinations);

        // Back to Results
        document.getElementById('backToResults').addEventListener('click', async () => {
            setBookingStep(searchResults);
            if (currentHold) await releaseHold();
        });

        // Reservation Flow
        document.querySelectorAll('input[name="reservationType"]').forEach(radio => {
            radio.addEventListener('change', function () {
                reservationType = this.value;
                updateSeatSelection();
            });
        });
        document.getElementById('proceedToReservation').addEventListener('click', handleCreateHold);
        document.getElementById('customerForm').addEventListener('submit', handleReservation);
        document.getElementById('reservationSearchForm').addEventListener('submit', handleReservationSearch);

        // Select seats button
        document.querySelectorAll('.js-select-seats').forEach(button => {
            button.addEventListener('click', async function() {
                const scheduleId = this.dataset.scheduleId;
                await selectSchedule(scheduleId);
            });
        });
    }

    initializeApp();
    setupEventListeners();
    loadRoutes();
    setMinDate();
    setView('home'); // Set initial view
});

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const sectionId = this.getAttribute('href').substring(1);

            if (sectionId === 'admin') {
                setView('admin');
            } else if (sectionId === 'reservations') {
                setView('lookup');
            } else {
                setView('home');
            }
            
            // Update active nav link
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // Search form
    searchForm.addEventListener('submit', handleSearch);

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
    document.getElementById('backToResults').addEventListener('click', async function() {
        // En lugar de ocultar/mostrar, cambiamos el estado de la vista
        // Nota: No hay un estado 'results', así que volvemos a 'home' que es donde están los resultados.
        setView('home');
        // Si el usuario vuelve atrás, liberamos el hold
        if (currentHold) {
            await releaseHold();
        }
    });

    // Proceed to reservation
    document.getElementById('proceedToReservation').addEventListener('click', handleCreateHold);

    // Customer form
    document.getElementById('customerForm').addEventListener('submit', handleReservation);

    // Reservation search
    document.getElementById('reservationSearchForm').addEventListener('submit', handleReservationSearch);

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });

    // Select seats button
    document.querySelectorAll('.js-select-seats').forEach(button => {
        button.addEventListener('click', async function() {
            const scheduleId = this.dataset.scheduleId;
            await selectSchedule(scheduleId);
        });
    });
}

function setMinDate() {
    const today = new Date().toISOString().split('T')[0];
    travelDateInput.min = today;
    travelDateInput.value = today;
}

async function loadRoutes() {
    try {
        const response = await fetch(`${API_BASE}/routes/locations`);
        if (!response.ok) throw new Error('Failed to fetch routes');
        const routes = await response.json();

        // Store the flat array of routes
        window.routesData = routes;

        // Populate origin select with unique origins
        const origins = [...new Set(routes.map(r => r.origin))].sort();
        originSelect.innerHTML = '<option value="">Selecciona origen</option>';
        origins.forEach(origin => {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            originSelect.appendChild(option);
        });

        // Initially, no destination is selected
        destinationSelect.innerHTML = '<option value="">Selecciona destino</option>';

    } catch (error) {
        console.error('Error loading routes:', error);
        showError('Error al cargar las rutas disponibles');
    }
}

function updateDestinations() {
    const selectedOrigin = originSelect.value;
    destinationSelect.innerHTML = '<option value="">Selecciona destino</option>';

    if (selectedOrigin && Array.isArray(window.routesData)) {
        const destinations = window.routesData
            .filter(route => route.origin === selectedOrigin)
            .map(route => route.destination)
            .sort();
        
        [...new Set(destinations)].forEach(destination => {
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
    
    try {
        // Validar con Zod antes de enviar
        window.schemas.TripQuerySchema.parse({ origin, destination, date });
    } catch (error) {
        handleZodError(error, 'searchForm');
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
        // Al buscar, nos aseguramos de que la vista 'home' esté activa
        setView('home');
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
                <button class="btn btn-primary js-select-seats" data-schedule-id="${schedule.schedule_id}" 
                        ${schedule.available_seats === 0 && !schedule.is_full_bus_available ? 'disabled' : ''}>
                    <i class="fas fa-chair"></i> Seleccionar Asientos
                </button>
            </div>
        `;
        
        schedulesList.appendChild(card);
    });
}

/**
 * Expone la función al scope global para que el `onclick` del HTML pueda encontrarla.
 */
window.selectSchedule = async function(scheduleId) {
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
    setView('seat-selection');
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
    
    setView('checkout');
}

async function handleCreateHold() {
    if (reservationType === 'seats' && selectedSeats.length === 0) {
        alert('Por favor selecciona al menos un asiento');
        return;
    }

    const holdData = {
        schedule_id: selectedSchedule.schedule_id,
        reservation_date: travelDateInput.value,
        selected_seats: selectedSeats
    };

    try {
        const response = await fetch(`${API_BASE}/holds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(holdData)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'No se pudieron reservar los asientos temporalmente.');
        }

        currentHold = {
            id: result.hold_id,
            expires_at: new Date(result.expires_at)
        };

        startHoldCountdown(currentHold.expires_at);
        showReservationForm();

    } catch (error) {
        console.error('Error creating hold:', error);
        showError(error.message);
    }
}

async function releaseHold() {
    if (!currentHold) return;
    try {
        await fetch(`${API_BASE}/holds/${currentHold.id}`, { method: 'DELETE' });
        console.log(`Hold ${currentHold.id} released.`);
    } catch (error) {
        console.error('Error releasing hold:', error);
    }
    currentHold = null;
    if (holdCountdownTimer) clearInterval(holdCountdownTimer);
    document.getElementById('holdTimer').style.display = 'none';
}

async function handleReservation(e) {
    e.preventDefault();
    
    if (!currentHold) {
        showError('Tu sesión ha expirado. Por favor, selecciona los asientos de nuevo.');
        // Aquí podrías redirigir o resetear la vista
        return;
    }

    const customerName = document.getElementById('customerName').value;
    const customerPhone = document.getElementById('customerPhone').value;
    const customerEmail = document.getElementById('customerEmail').value;
    
    const reservationData = {
        hold_id: currentHold.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail
    };

    try {
        // Validar con Zod antes de enviar
        window.schemas.CreateReservationSchema.parse(reservationData);
    } catch (error) {
        handleZodError(error, 'customerForm');
        return;
    }
    
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
            // Detener el contador del hold y limpiar el estado
            if (holdCountdownTimer) clearInterval(holdCountdownTimer);
            currentHold = null;

            displayPaymentInstructions(result);
            setView('success');
        } else {
            showError(result.error || 'Error al crear la reserva');
        }
    } catch (error) {
        console.error('Error creating reservation:', error);
        showError('Error al procesar la reserva');
    }
}

function displayPaymentInstructions(data) {
    document.getElementById('reservationId').textContent = data.reservation_id;
    document.getElementById('finalPrice').textContent = data.total_price;
    document.getElementById('paymentDeadline').textContent = new Date(data.payment_deadline).toLocaleString('es-ES');
    document.getElementById('whatsappNumber').textContent = data.whatsapp_number;

    const whatsappNumberClean = data.whatsapp_number.replace(/[^0-9]/g, '');
    const whatsappMessage = `Hola, quiero confirmar mi reserva con ID: ${data.reservation_id}`;
    document.getElementById('whatsappLink').href = `https://wa.me/${whatsappNumberClean}?text=${encodeURIComponent(whatsappMessage)}`;

    startCountdown(new Date(data.payment_deadline));
}

function startHoldCountdown(deadline) {
    const countdownElement = document.getElementById('holdCountdown');
    document.getElementById('holdTimer').style.display = 'block';

    if (holdCountdownTimer) clearInterval(holdCountdownTimer);

    holdCountdownTimer = setInterval(() => {
        const now = new Date().getTime();
        const distance = deadline.getTime() - now;

        if (distance < 0) {
            clearInterval(holdCountdownTimer);
            countdownElement.textContent = 'EXPIRADO';
            showError('Tu tiempo para reservar ha expirado. Por favor, intenta de nuevo.');
            // Aquí podrías resetear la vista para que el usuario empiece de nuevo
            releaseHold();
            // Opcional: recargar la página o volver a la selección de asientos
            return;
        }

        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function startCountdown(deadline) {
    const countdownElement = document.getElementById('countdown');
    
    // Clear any existing timer
    if (countdownTimer) clearInterval(countdownTimer);

    countdownTimer = setInterval(() => {
        const now = new Date().getTime();
        const distance = deadline.getTime() - now;
        
        if (distance < 0) {
            clearInterval(countdownTimer);
            countdownElement.textContent = 'EXPIRADO';
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
    const detailsDiv = document.getElementById('reservationDetails');
    
    if (!reservationId) return;

    try {
        const response = await fetch(`${API_BASE}/reservations/${reservationId}`);
        
        if (response.ok) {
            const reservation = await response.json();
            displayReservationDetails(reservation);
        } else {
            detailsDiv.innerHTML = `<p class="error-message">Reserva no encontrada.</p>`;
            detailsDiv.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error searching reservation:', error);
        detailsDiv.innerHTML = `<p class="error-message">Error al buscar la reserva.</p>`;
        detailsDiv.classList.remove('hidden');
    }
}

function displayReservationDetails(reservation) {
    const detailsDiv = document.getElementById('reservationDetails');
    
    const statusColors = {
        'pending': '#f39c12',
        'confirmed': '#27ae60',
        'cancelled': '#e74c3c',
        'expired': '#7f8c8d'
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
                <h3>Reserva ${reservation.id.substring(0, 8)}...</h3>
                <span class="status" style="background-color: ${statusColors[reservation.status] || '#bdc3c7'}">
                    ${statusTexts[reservation.status] || reservation.status}
                </span>
            </div>
            <div class="reservation-info">
                <div class="info-row"><strong>Ruta:</strong> ${reservation.origin} → ${reservation.destination}</div>
                <div class="info-row"><strong>Fecha:</strong> ${new Date(reservation.reservation_date).toLocaleDateString('es-ES')}</div>
                <div class="info-row"><strong>Horario:</strong> ${reservation.departure_time} - ${reservation.arrival_time}</div>
                <div class="info-row"><strong>Autobús:</strong> ${reservation.bus_number} (${reservation.type})</div>
                <div class="info-row"><strong>Asientos:</strong> ${seatInfo}</div>
                <div class="info-row"><strong>Pasajero:</strong> ${reservation.customer_name}</div>
                <div class="info-row"><strong>Total:</strong> $${reservation.total_price}</div>
                <div class="info-row"><strong>Creada:</strong> ${new Date(reservation.created_at).toLocaleString('es-ES')}</div>
            </div>
        </div>
    `;
    
    detailsDiv.classList.remove('hidden');
}

// --- Utility Functions ---

function showLoading() {
    loading.classList.remove('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
}

function showError(message) {
    schedulesList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>${message}</p></div>`;
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
}

function showModal(content) {
    document.getElementById('modalBody').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
}

function handleZodError(error, formId) {
    // Limpiar errores anteriores
    const form = document.getElementById(formId);
    form.querySelectorAll('.error-feedback').forEach(el => el.remove());

    if (error.errors) {
        error.errors.forEach(err => {
            const fieldName = err.path[0];
            const input = form.querySelector(`[name="${fieldName}"]`) || form.querySelector(`#${fieldName}`);
            if (input) {
                const errorElement = document.createElement('div');
                errorElement.className = 'error-feedback';
                errorElement.textContent = err.message;
                input.parentElement.appendChild(errorElement);
            }
        });
    }
}
