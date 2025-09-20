"use strict";
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const csurf = require('csurf');
// --- Configuración de Entorno ---
const IS_PROD = process.env.NODE_ENV === 'production';
if (!IS_PROD) {
    require('dotenv').config();
}
// --- Importaciones de la Aplicación ---
const pool = require('./database/db');
const busRoutes = require('./routes/buses');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const routesRoutes = require('./routes/routes');
const holdsRoutes = require('./routes/holds');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const app = express();
// --- Middleware de Seguridad y Rendimiento ---
// 1. Helmet para cabeceras de seguridad
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://kit.fontawesome.com"],
            "connect-src": ["'self'", "https://ka-f.fontawesome.com"],
            "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            "font-src": ["'self'", "https://cdnjs.cloudflare.com", "https://ka-f.fontawesome.com"],
            "img-src": ["'self'", "data:"]
        },
    }
}));
// 2. CORS con Allowlist
const allowlist = [
    'http://localhost:3000',
    'https://bus-reservation-api-rp8b.onrender.com' // URL de producción
];
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowlist.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};
app.use(cors(corsOptions));
// 3. Compresión de respuestas
app.use(compression());
// 4. Rate Limiter para rutas sensibles
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limita cada IP a 100 peticiones por ventana
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo en 15 minutos.'
});
// --- Middleware de Logging ---
app.use((req, res, next) => {
    const requestId = uuidv4();
    const startTime = process.hrtime();
    res.setHeader('X-Request-Id', requestId);
    console.log(`[${requestId}] ==> ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
        const diff = process.hrtime(startTime);
        const responseTime = (diff[0] * 1e3 + diff[1] * 1e-6).toFixed(2);
        console.log(`[${requestId}] <== ${res.statusCode} (${responseTime}ms)`);
    });
    next();
});
// --- Configuración de Middleware y Rutas ---
// Confiar en el proxy de Render para que `secure: true` en cookies funcione
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}
// Middleware para parsear JSON y servir archivos estáticos
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Configuración de Sesión
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // `true` solo en producción
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax'
    }
}));
// CSRF Protection
const csrfProtection = csurf();
// Aplicar CSRF solo si no estamos en entorno de prueba
if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        // Excluir rutas específicas de la protección CSRF
        if (req.path === '/api/reservations/expire-pending' || req.path === '/api/holds/expire') {
            return next();
        }
        csrfProtection(req, res, next);
    });
}
// Ruta explícita para servir admin.html con protección
app.get('/admin.html', (req, res) => {
    if (req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    else {
        res.status(403).send('Acceso denegado');
    }
});
// Aplicar el rate limiter a las rutas de la API
app.use('/api/reservations', apiLimiter, reservationRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
// Rutas que no necesitan rate limiting tan estricto
app.use('/api/buses', busRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/holds', holdsRoutes);
// Manejador de errores de CSRF global
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn(`Intento de CSRF bloqueado desde la IP: ${req.ip}`);
        res.status(403).json({ error: 'Token CSRF inválido o ausente. Petición bloqueada.' });
    }
    else {
        next(err);
    }
});
module.exports = app;
