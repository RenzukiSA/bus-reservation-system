const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const csurf = require('csurf');
const { v4: uuidv4 } = require('uuid');

const pool = require('./database/db');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const busRoutes = require('./routes/buses');
const routesRoutes = require('./routes/routes');
const holdsRoutes = require('./routes/holds');
const authRoutes = require('./routes/auth');

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();

// Middlewares de seguridad y rendimiento van PRIMERO
app.use(helmet());
app.use(compression());

// Servir public desde ambas ubicaciones (ejecutando desde dist y desde raíz)
// ESTOS DEBEN IR ANTES de los middlewares de autenticación
app.use('/public', express.static(path.resolve(__dirname, '../public'), { maxAge: '7d', etag: true }));
app.use('/public', express.static(path.resolve(__dirname, 'public'), { maxAge: '7d', etag: true }));

// Rutas públicas que NO requieren autenticación (ANTES de session y CSRF)
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

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

// Configurar CSRF
const csrfProtection = csurf();

if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        if (req.path === '/api/reservations/expire-pending' || req.path === '/api/holds/expire') {
            return next();
        }
        csrfProtection(req, res, next);
    });
}

// Rutas de admin protegidas (middleware aplicado en server.js)
app.get('/admin', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/admin.html'));
});

const apiLimiter = require('./middleware/rateLimiter');
app.use('/api/reservations', apiLimiter, reservationRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/holds', holdsRoutes);
app.use('/api/auth', authRoutes); // Usar las nuevas rutas de autenticación

// Manejo de errores CSRF al final
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn(`Intento de CSRF bloqueado desde la IP: ${req.ip}`);
        res.status(403).json({ error: 'Token CSRF inválido o ausente. Petición bloqueada.' });
    } else {
        next(err);
    }
});

module.exports = app;
