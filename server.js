const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ 
    path: path.resolve(__dirname, '.env'), 
    override: true, 
    encoding: 'utf8' 
});

const { Pool } = require('pg');
const { initDatabase } = require('./database/init');
const busRoutes = require('./routes/buses');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de la base de datos PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware para pasar la conexión a la DB a las rutas
app.use((req, res, next) => {
    req.db = pool;
    next();
});

// Session Middleware with PostgreSQL store
app.use(session({
    store: new pgSession({
        pool: pool,                // Connection pool
        tableName: 'user_sessions'   // Table name for sessions
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Hash admin password on startup
let adminPasswordHash;
bcrypt.hash(process.env.ADMIN_PASSWORD, 10).then(hash => {
    adminPasswordHash = hash;
    console.log('Admin password hashed and ready.');
}).catch(err => console.error('Error hashing password:', err));

// Make database and password hash available to routes
app.use((req, res, next) => {
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

// Servir archivos estáticos de la app de React en producción
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'client/build')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
    });
}

// Inicializar la base de datos y arrancar el servidor
async function startServer() {
    try {
        await initDatabase(pool);
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        });
    } catch (error) {
        console.error('Error al iniciar el servidor:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
