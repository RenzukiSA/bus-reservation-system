document.addEventListener('DOMContentLoaded', () => {
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

    // --- Auth DOM Elements ---
    const adminLink = document.getElementById('admin-link');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const loginLink = document.getElementById('login-link');
    const logoutLink = document.getElementById('logout-link');

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
    async function initializeApp() {
        await updateAuthUI(); // Comprobar estado de autenticación primero
        setupEventListeners();
        loadRoutes();
        setMinDate();
        setView('home');

        // Mostrar el estado inicial en la tarjeta de resultados
        const resultsInitialState = document.getElementById('results-initial-state');
        if (resultsInitialState) {
            resultsInitialState.classList.remove('is-hidden');
        }
        // Ocultar la lista de horarios y el spinner de carga
        document.getElementById('schedulesList').innerHTML = '';
        document.getElementById('loading').classList.add('is-hidden');
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

        // Logout
        if (logoutLink) {
            logoutLink.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await fetch('/api/auth/logout', { method: 'POST' });
                    window.location.reload(); // Recargar la página para reflejar el cierre de sesión
                } catch (error) {
                    console.error('Error al cerrar sesión:', error);
                }
            });
        }
    }

    // --- Auth UI Logic ---
    async function updateAuthUI() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();

            if (data.loggedIn) {
                // Usuario ha iniciado sesión
                loginLink.classList.add('is-hidden');
                logoutLink.classList.remove('is-hidden');
                userInfo.classList.remove('is-hidden');
                userName.textContent = data.user.name;

                if (data.user.role === 'admin') {
                    adminLink.classList.remove('is-hidden');
                }
            } else {
                // Usuario no ha iniciado sesión
                loginLink.classList.remove('is-hidden');
                logoutLink.classList.add('is-hidden');
                userInfo.classList.add('is-hidden');
                adminLink.classList.add('is-hidden');
            }
        } catch (error) {
            console.error('Error al verificar el estado de autenticación:', error);
            // Asegurarse de que los enlaces de no-autenticado sean visibles si hay un error
            loginLink.classList.remove('is-hidden');
            logoutLink.classList.add('is-hidden');
            userInfo.classList.add('is-hidden');
            adminLink.classList.add('is-hidden');
        }
    }

    // --- API & Logic Functions (Abridged for brevity, paste the full functions here) ---
    // All your existing functions like handleSearch, loadRoutes, selectSchedule, etc.
    // will go here, but we'll modify the parts that show/hide elements.

    async function handleSearch(e) {
        e.preventDefault();
        const origin = originSelect.value;
        const destination = destinationSelect.value;
        const date = travelDateInput.value;

        if (!origin || !destination || !date) {
            alert('Por favor completa todos los campos');
            return;
        }

        loading.classList.remove('is-hidden');
        searchResults.classList.add('is-hidden');
        noResults.classList.add('is-hidden');

        try {
            const url = `${API_BASE}/buses/schedules?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${date}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const schedules = await response.json();
            currentSchedules = schedules;
            displaySchedules(schedules);

        } catch (error) {
            console.error('Error searching schedules:', error);
            showError('Error al buscar viajes disponibles');
        } finally {
            loading.classList.add('is-hidden');
        }
    }

    function displaySchedules(schedules) {
        schedulesList.innerHTML = '';
        if (schedules.length === 0) {
            noResults.classList.remove('is-hidden');
        } else {
            noResults.classList.add('is-hidden');
            schedules.forEach(schedule => {
                // ... (your existing schedule card creation logic)
                 const card = document.createElement('div');
                 card.className = 'schedule-card';
                 const availabilityText = schedule.is_full_bus_available ? 'Autobús completo disponible' : `${schedule.available_seats} asientos disponibles`;
                 card.innerHTML = `
                     <div class="schedule-header">
                         <div class="schedule-time"><span>${schedule.departure_time}</span> <i class="fas fa-arrow-right"></i> <span>${schedule.arrival_time}</span></div>
                         <div class="bus-type">${schedule.bus_type.replace('_', ' ').toUpperCase()}</div>
                     </div>
                     <div class="schedule-info">
                         <div class="info-item"><div class="label">Autobús</div><div class="value">${schedule.bus_number}</div></div>
                         <div class="info-item"><div class="label">Disponibilidad</div><div class="value">${availabilityText}</div></div>
                         <div class="info-item"><div class="label">Precio por asiento</div><div class="value">$${schedule.base_total_price}</div></div>
                         <div class="info-item"><div class="label">Autobús completo</div><div class="value">$${schedule.full_bus_price}</div></div>
                     </div>
                     <div class="schedule-actions">
                         <button class="btn btn-primary" onclick="selectSchedule(${schedule.schedule_id})" ${schedule.available_seats === 0 && !schedule.is_full_bus_available ? 'disabled' : ''}>
                             <i class="fas fa-chair"></i> Seleccionar Asientos
                         </button>
                     </div>`;
                 schedulesList.appendChild(card);
            });
        }
        setBookingStep(searchResults);
    }

    window.selectSchedule = async function(scheduleId) {
        selectedSchedule = currentSchedules.find(s => s.schedule_id === scheduleId);
        if (!selectedSchedule) return showError('Error al seleccionar el horario');
        
        document.getElementById('selectedScheduleInfo').textContent = `${selectedSchedule.departure_time} - ${selectedSchedule.arrival_time} | ${selectedSchedule.bus_number}`;
        await loadSeatMap(scheduleId);
        setBookingStep(seatSelection);
    }

    async function handleCreateHold() {
        // ... (your existing hold creation logic)
        // On success:
        // currentHold = { ... };
        // startHoldCountdown(currentHold.expires_at);
        // setBookingStep(reservationForm);
    }

    async function handleReservation(e) {
        e.preventDefault();
        // ... (your existing reservation creation logic)
        // On success:
        // if (holdCountdownTimer) clearInterval(holdCountdownTimer);
        // currentHold = null;
        // displayPaymentInstructions(result);
        // setBookingStep(paymentInstructions);
    }

    async function loadRoutes() {
        try {
            const response = await fetch(`${API_BASE}/routes/locations`);
            if (!response.ok) throw new Error('Failed to fetch routes');
            const routes = await response.json();
            window.routesData = routes;
            const origins = [...new Set(routes.map(r => r.origin))].sort();
            originSelect.innerHTML = '<option value="">Selecciona origen</option>';
            origins.forEach(origin => {
                const option = document.createElement('option');
                option.value = origin;
                option.textContent = origin;
                originSelect.appendChild(option);
            });
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

    function setMinDate() {
        const today = new Date().toISOString().split('T')[0];
        travelDateInput.min = today;
        travelDateInput.value = today;
    }

    async function loadSeatMap(scheduleId) {
        try {
            const date = travelDateInput.value;
            const response = await fetch(`${API_BASE}/buses/seats/${scheduleId}?date=${date}`);
            const data = await response.json();
            seatMap = data.seats;
            displaySeatMap(data.seats, data.has_full_bus_reservation);
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
                seatElement.addEventListener('click', function () {
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
            selectedSeats.splice(index, 1);
            seatElement.classList.remove('selected');
        } else {
            selectedSeats.push(seatId);
            seatElement.classList.add('selected');
        }
        updatePriceSummary();
    }

    function updateSeatSelection() {
        if (reservationType === 'full_bus') {
            document.querySelectorAll('.seat.available').forEach(seat => {
                seat.classList.add('selected');
            });
            selectedSeats = seatMap.filter(seat => seat.is_available).map(seat => seat.id);
        } else {
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
        let finalPrice = 0;
        if (reservationType === 'full_bus') {
            selectedSeatsCount.textContent = 'Autobús completo';
            selectedSeatsList.innerHTML = '<p>Reserva de autobús completo</p>';
            finalPrice = selectedSchedule.full_bus_price;
            totalPrice.textContent = finalPrice;
            proceedBtn.disabled = false;
        } else {
            selectedSeatsCount.textContent = selectedSeats.length;
            if (selectedSeats.length > 0) {
                const seatNumbers = selectedSeats.map(seatId => {
                    const seat = seatMap.find(s => s.id === seatId);
                    return seat ? seat.seat_number : '';
                }).filter(Boolean);
                selectedSeatsList.innerHTML = `<p>Asientos: ${seatNumbers.join(', ')}</p>`;
                let total = 0;
                selectedSeats.forEach(seatId => {
                    const seat = seatMap.find(s => s.id === seatId);
                    if (seat) {
                        total += parseFloat(selectedSchedule.base_total_price) * seat.price_modifier;
                    }
                });
                finalPrice = total.toFixed(2);
                totalPrice.textContent = finalPrice;
                proceedBtn.disabled = false;
            } else {
                selectedSeatsList.innerHTML = '<p>No hay asientos seleccionados</p>';
                finalPrice = 0;
                totalPrice.textContent = '0.00';
                proceedBtn.disabled = true;
            }
        }
        if (window.updateLiveTotal) {
            window.updateLiveTotal(finalPrice);
        }
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
            setBookingStep(reservationForm);

        } catch (error) {
            console.error('Error creating hold:', error);
            showError(error.message);
        }
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
                setBookingStep(paymentInstructions);
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

    // --- Utility Functions ---
    function showLoading() {
        loading.classList.remove('is-hidden');
        schedulesList.innerHTML = ''; // Limpiar resultados anteriores
        noResults.classList.add('is-hidden'); // Ocultar estado inicial
    }

    function hideLoading() {
        loading.classList.add('is-hidden');
    }

    function showError(message) {
        schedulesList.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i><p>${message}</p></div>`;
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

    // --- Start App ---
    initializeApp();
});
