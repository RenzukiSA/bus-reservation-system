// require('ts-node').register(); // Esto se moverá al punto de entrada de desarrollo

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const csurf = require('csurf');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

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
// ESTOS DEBEN IR ANTES de los middlewares de autenticación
app.use('/public', express.static(path.resolve(__dirname, '../public'), { maxAge: '7d', etag: true }));
app.use('/public', express.static(path.resolve(__dirname, 'public'), { maxAge: '7d', etag: true }));

// Rutas públicas que NO requieren autenticación (ANTES de session y CSRF)
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/login.html'));
});

// POST /login - Validar credenciales y crear sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    try {
        // Buscar al usuario por su email en la base de datos
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rowCount === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = userResult.rows[0];

        // Comparar la contraseña proporcionada con la contraseña hasheada en la BD
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Si las credenciales son correctas, crear la sesión del usuario
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        // Redirigir a la página principal
        res.json({ success: true, redirect: '/' });

    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// Configurar sesiones DESPUÉS de las rutas públicas pero ANTES de CSRF y rutas protegidas
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

// Aplicar middleware de admin SOLO a rutas específicas
app.use('/admin', ensureAdmin);
app.use('/api/admin', ensureAdmin);

// Configurar CSRF DESPUÉS de las sesiones
const csrfProtection = csurf();

if (process.env.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
        if (req.path === '/api/reservations/expire-pending' || req.path === '/api/holds/expire') {
            return next();
        }
        csrfProtection(req, res, next);
    });
}

// Rutas de admin protegidas (ya tienen el middleware aplicado arriba)
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
