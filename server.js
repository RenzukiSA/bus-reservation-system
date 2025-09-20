const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

// --- Configuración de Entorno ---
const IS_PROD = process.env.NODE_ENV === 'production';
if (!IS_PROD) {
  require('dotenv').config();
}

// --- Importaciones de la Aplicación ---
const pool = require('./database/db');
const { initDatabase } = require('./database/init');
const busRoutes = require('./routes/buses');
const reservationRoutes = require('./routes/reservations');
const adminRoutes = require('./routes/admin');
const routesRoutes = require('./routes/routes');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware de Seguridad y Rendimiento ---

// 1. Helmet para cabeceras de seguridad
app.use(
  helmet({
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
  })
);

// 2. CORS con Allowlist
const allowlist = [
  'http://localhost:3000',
  // !! IMPORTANTE: Añade aquí la URL de tu frontend en Render
  // 'https://tu-app.onrender.com'
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowlist.includes(origin)) {
      callback(null, true);
    } else {
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
if (IS_PROD) {
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
        secure: IS_PROD, // `true` solo en producción
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax'
    }
}));

// Ruta explícita para servir admin.html con protección
app.get('/admin.html', (req, res) => {
    if (req.session.isAdmin) {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } else {
        res.status(403).send('Acceso denegado');
    }
});

// Aplicar el rate limiter a las rutas de la API
app.use('/api/reservations', apiLimiter, reservationRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);

// Rutas que no necesitan rate limiting tan estricto
app.use('/api/buses', busRoutes);
app.use('/api/routes', routesRoutes);

// --- Inicialización del Servidor ---

async function startServer() {
    try {
        await initDatabase(pool);
        console.log('Base de datos inicializada correctamente.');
        return app; // Devolver la app configurada

    } catch (error) {
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    }
}

// Exportar una promesa que se resuelve con la app lista
const appPromise = startServer();

// Iniciar el servidor solo si el archivo se ejecuta directamente
if (require.main === module) {
    appPromise.then(app => {
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        });
    });
}

module.exports = appPromise;
