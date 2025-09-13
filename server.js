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

// Función para iniciar el servidor
async function startServer() {
    try {
        // 1. Inicializar la base de datos
        await initDatabase(pool);

        // 2. Cifrar la contraseña del administrador
        const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        console.log('Admin password hashed and ready.');

        // 3. Configurar middlewares
        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));

        // Middleware para la conexión a la DB
        app.use((req, res, next) => {
            req.db = pool;
            next();
        });

        // Middleware para la sesión
        app.use(session({
            store: new pgSession({
                pool: pool,
                tableName: 'user_sessions'
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

        // Middleware para pasar el hash de la contraseña a las rutas
        app.use((req, res, next) => {
            req.adminPasswordHash = adminPasswordHash;
            next();
        });

        // 4. Configurar las rutas de la API
        app.use('/api/buses', busRoutes);
        app.use('/api/reservations', reservationRoutes);
        app.use('/api/admin', adminRoutes);

        // Servir archivos estáticos de React en producción
        if (process.env.NODE_ENV === 'production') {
            app.use(express.static(path.join(__dirname, 'client/build')));
            app.get('*', (req, res) => {
                res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
            });
        }

        // 5. Iniciar el servidor
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        });

    } catch (error) {
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    }
}

// Ejecutar la función de inicio
startServer();

module.exports = app;
