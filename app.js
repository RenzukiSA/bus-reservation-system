// require('ts-node').register(); // Esto se moverá al punto de entrada de desarrollo

const express = require('express');
const cors = require('cors');
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

// Servir estáticos de forma robusta.
// En producción, __dirname es /dist, y la carpeta public se copia a /dist/public.
// Por lo tanto, la ruta correcta es simplemente 'public' relativa a __dirname.
app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

// Añadir una ruta explícita para servir index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint de verificación de assets (solo para desarrollo)
if (!IS_PROD) {
    app.get('/__assets', (req, res) => {
        res.json({
            css: '/public/css/main.css',
            js: '/public/js/app.js',
            ok: true
        });
    });
}

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

app.get('/admin.html', (req, res) => {
    if (req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.status(403).send('Acceso denegado');
    }
});

const apiLimiter = require('./middleware/rateLimiter');
app.use('/api/reservations', apiLimiter, reservationRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/routes', routesRoutes);
app.use('/api/holds', holdsRoutes);

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.warn(`Intento de CSRF bloqueado desde la IP: ${req.ip}`);
        res.status(403).json({ error: 'Token CSRF inválido o ausente. Petición bloqueada.' });
    } else {
        next(err);
    }
});

module.exports = app;
