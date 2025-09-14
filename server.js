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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function startServer() {
    try {
        await initDatabase(pool);
        const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        console.log('Admin password hashed and ready.');

        app.use(cors());
        app.use(express.json());
        app.use(express.static(path.join(__dirname, 'public')));
        
        app.set('trust proxy', 1); 

        app.use((req, res, next) => {
            req.db = pool;
            next();
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
                secure: process.env.NODE_ENV === 'production',
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
                sameSite: 'lax'
            }
        }));

        app.use((req, res, next) => {
            req.adminPasswordHash = adminPasswordHash;
            next();
        });

        // --- INICIO DE CÓDIGO AÑADIDO ---
        // Ruta explícita para servir admin.html
        app.get('/admin.html', (req, res) => {
            // Asegurarse de que solo los administradores puedan acceder
            if (req.session.isAdmin) {
                res.sendFile(path.join(__dirname, 'public', 'admin.html'));
            } else {
                res.redirect('/'); // Si no es admin, redirigir a la página principal
            }
        });
        // --- FIN DE CÓDIGO AÑADIDO ---

        app.use('/api/buses', busRoutes);
        app.use('/api/reservations', reservationRoutes);
        app.use('/api/admin', adminRoutes);
        
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        });

    } catch (error) {
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;
