const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// Middleware para verificar si el usuario es administrador
const checkAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado.' });
    }
};

// --- Autenticación ---

// Login
router.post('/login', async (req, res) => {
    const { password } = req.body;
    try {
        const passwordMatch = await bcrypt.compare(password, req.adminPasswordHash);
        if (passwordMatch) {
            req.session.isAdmin = true;
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
        }
    } catch (error) {
        console.error('Error en el login de administrador:', error);
        res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Verificar estado de la sesión
router.get('/status', (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
});

// --- Gestión de Reservaciones ---

// Obtener todas las reservaciones con filtros opcionales
router.get('/reservations', checkAdmin, async (req, res) => {
    const { status, date } = req.query;
    let query = `
        SELECT 
            r.id, r.customer_name, r.total_price, r.status, r.reservation_date,
            ro.origin, ro.destination
        FROM reservations r
        JOIN schedules s ON r.schedule_id = s.id
        JOIN routes ro ON s.route_id = ro.id
    `;
    const params = [];
    let conditionIndex = 1;

    if (status || date) {
        query += ' WHERE';
        if (status) {
            query += ` r.status = $${conditionIndex++}`;
            params.push(status);
        }
        if (date) {
            if (params.length > 0) query += ' AND';
            query += ` DATE(r.reservation_date) = $${conditionIndex++}`;
            params.push(date);
        }
    }
    
    query += ' ORDER BY r.created_at DESC';

    try {
        const result = await req.db.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener las reservaciones de admin:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Get dashboard statistics
router.get('/dashboard', checkAdmin, async (req, res) => {
    try {
        const db = req.db;

        const statusQuery = `SELECT status, COUNT(*) as count FROM reservations GROUP BY status`;
        const revenueQuery = `
            SELECT 
                EXTRACT(YEAR FROM created_at) as year,
                EXTRACT(MONTH FROM created_at) as month,
                SUM(total_price) as revenue
            FROM reservations
            WHERE status = 'confirmed'
            GROUP BY 1, 2
            ORDER BY 1 DESC, 2 DESC
            LIMIT 1;
        `;
        const popularRoutesQuery = `
            SELECT ro.origin, ro.destination, COUNT(r.id) as reservation_count
            FROM reservations r
            JOIN schedules s ON r.schedule_id = s.id
            JOIN routes ro ON s.route_id = ro.id
            GROUP BY ro.origin, ro.destination
            ORDER BY reservation_count DESC
            LIMIT 5;
        `;

        const [statusResult, revenueResult, popularRoutesResult] = await Promise.all([
            db.query(statusQuery),
            db.query(revenueQuery),
            db.query(popularRoutesQuery)
        ]);

        res.json({
            reservations_by_status: statusResult.rows,
            monthly_revenue: revenueResult.rows,
            popular_routes: popularRoutesResult.rows
        });

    } catch (err) {
        console.error('Error al obtener estadísticas del dashboard:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Get all routes for admin
router.get('/routes', checkAdmin, async (req, res) => {
    const db = req.db;
    try {
        const result = await db.query('SELECT * FROM routes ORDER BY origin, destination');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener rutas:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Get all buses for admin
router.get('/buses', checkAdmin, async (req, res) => {
    const db = req.db;
    try {
        const result = await db.query('SELECT * FROM buses ORDER BY bus_number');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener autobuses:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Get all schedules for admin
router.get('/schedules', checkAdmin, async (req, res) => {
    const db = req.db;
    try {
        const result = await db.query(`
            SELECT 
                s.*,
                r.origin,
                r.destination,
                b.bus_number,
                b.bus_type
            FROM schedules s
            JOIN routes r ON s.route_id = r.id
            JOIN buses b ON s.bus_id = b.id
            ORDER BY r.origin, s.departure_time
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener horarios:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;

