// require('ts-node').register(); // Esto se moverá al punto de entrada de desarrollo

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const csurf = require('csurf');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);

const pool = require('./database/db');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const busRoutes = require('./routes/buses');
const routesRoutes = require('./routes/routes');
const holdsRoutes = require('./routes/holds');
const authRoutes = require('./routes/auth'); // Importar las nuevas rutas de autenticación

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();

// Middlewares de seguridad y rendimiento van PRIMERO
app.use(helmet());
app.use(compression());

// Logger Middleware
app.use((req, res, next) => {
    const requestId = uuidv4();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    const start = Date.now();
    console.log(`[${requestId}] ==> ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${requestId}] <== ${res.statusCode} (${duration}ms)`);
    });
    next();
});

if (IS_PROD) {
    app.set('trust proxy', 1);
}

app.use(express.json());

// Servir public desde ambas ubicaciones (ejecutando desde dist y desde raíz)
app.use('/public', express.static(path.resolve(__dirname, '../public'), { maxAge: '7d', etag: true }));
app.use('/public', express.static(path.resolve(__dirname, 'public'), { maxAge: '7d', etag: true }));

// Añadir una ruta explícita para servir index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para servir la página de login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Middleware para verificar si el usuario es administrador
const ensureAdmin = (req, res, next) => {
    // Esta es la lógica de seguridad. Comprueba si en la sesión del usuario
    // existe la información de que es un 'admin'.
    if (req.session.user && req.session.user.role === 'admin') {
        return next(); // Si es admin, permite el acceso.
    }
    // Si no es admin, deniega el acceso de forma segura.
    res.status(403).send('Acceso denegado. Se requieren privilegios de administrador.');
};

// Ruta protegida para el panel de administración
app.get('/admin', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PROD,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, 
        sameSite: 'lax'
    }
}));

const csrfProtection = csurf();

if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        if (req.path === '/api/reservations/expire-pending' || req.path === '/api/holds/expire') {
            return next();
        }
        csrfProtection(req, res, next);
    });
}

const apiLimiter = require('./middleware/rateLimiter');
app.use('/api/reservations', apiLimiter, reservationRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/holds', holdsRoutes);
app.use('/api/auth', authRoutes); // Usar las nuevas rutas de autenticación

// Healthcheck endpoint
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn(`Intento de CSRF bloqueado desde la IP: ${req.ip}`);
        res.status(403).json({ error: 'Token CSRF inválido o ausente. Petición bloqueada.' });
    } else {
        next(err);
    }
});

module.exports = app;

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

    // Paste all your other functions here (loadRoutes, updateDestinations, loadSeatMap, etc.)
    // Make sure to remove any manual .classList.add/remove('hidden') from them
    // that conflict with the new setView/setBookingStep functions.

    // --- Start App ---
    initializeApp();
});
