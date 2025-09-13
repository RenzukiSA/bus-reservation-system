const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ 
    path: path.resolve(__dirname, '.env'), 
    override: true, 
    encoding: 'utf8' 
});

const { initDatabase } = require('./database/init');
const busRoutes = require('./routes/buses');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Session Middleware
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Set response headers to prevent encoding issues
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Hash admin password on startup
let adminPasswordHash;
bcrypt.hash(process.env.ADMIN_PASSWORD, 10).then(hash => {
    adminPasswordHash = hash;
    console.log('Admin password hashed and ready.');
}).catch(err => console.error('Error hashing password:', err));

// Initialize database
const db = initDatabase();

// Make database and password hash available to routes
app.use((req, res, next) => {
    req.db = db;
    req.adminPasswordHash = adminPasswordHash;
    next();
});

// Routes
app.use('/api/buses', busRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/admin', adminRoutes);

app.post('/api/login', async (req, res) => {
    console.log('--- [DEBUG] Iniciando /api/login ---');
    const { password } = req.body;
    console.log(`[DEBUG] Contraseña recibida: ${password ? 'Sí' : 'No'}`);
    console.log(`[DEBUG] Hash de contraseña disponible: ${req.adminPasswordHash ? 'Sí' : 'No'}`);

    if (!password || !req.adminPasswordHash) {
        console.log('[DEBUG] Error: Faltan datos para el login.');
        return res.status(400).json({ error: 'La contraseña es requerida' });
    }

    try {
        console.log('[DEBUG] Intentando comparar contraseñas con bcrypt...');
        const match = await bcrypt.compare(password, req.adminPasswordHash);
        console.log(`[DEBUG] bcrypt.compare completado. Coincidencia: ${match}`);

        if (match) {
            req.session.isAdmin = true;
            console.log('[DEBUG] Login exitoso. Sesión establecida.');
            return res.json({ message: 'Login exitoso' });
        }
        
        console.log('[DEBUG] Contraseña inválida.');
        res.status(401).json({ error: 'Contraseña inválida' });
    } catch (error) {
        console.error('--- [DEBUG] ¡ERROR CATASTRÓFICO EN LOGIN! ---', error);
        res.status(500).json({ error: 'Error al procesar el login' });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(` Bus Reservation System running on port ${PORT}`);
    console.log(` Access the app at: http://localhost:${PORT}`);
});

module.exports = app;
