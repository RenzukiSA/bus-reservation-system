const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// Middleware to check if admin is logged in
const checkAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado. Debes iniciar sesión como administrador.' });
    }
};

// Admin login
router.post('/login', async (req, res) => {
    const { password } = req.body;
    const adminPasswordHash = req.adminPasswordHash;

    if (!password || !adminPasswordHash) {
        return res.status(400).json({ error: 'La configuración del servidor es incorrecta.' });
    }

    try {
        const match = await bcrypt.compare(password, adminPasswordHash);
        if (match) {
            req.session.isAdmin = true;
            res.json({ success: true, message: 'Inicio de sesión exitoso.' });
        } else {
            res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
        }
    } catch (err) {
        console.error('Error durante el inicio de sesión del administrador:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Admin logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
        }
        res.clearCookie('connect.sid'); // El nombre de la cookie puede variar
        res.json({ success: true, message: 'Sesión cerrada exitosamente.' });
    });
});

// Check session status
router.get('/status', (req, res) => {
    if (req.session.isAdmin) {
        res.json({ isAdmin: true });
    } else {
        res.json({ isAdmin: false });
    }
});

// Get all reservations (protected)
router.get('/reservations', checkAdmin, async (req, res) => {
    const { status, date, customer } = req.query;
    let query = `
        SELECT res.*, r.origin, r.destination, s.departure_time, b.bus_number
        FROM reservations res
        JOIN schedules s ON res.schedule_id = s.id
        JOIN routes r ON s.route_id = r.id
        JOIN buses b ON s.bus_id = b.id
    `;
    const params = [];
    const conditions = [];

    if (status) {
        params.push(status);
        conditions.push(`res.status = $${params.length}`);
    }
    if (date) {
        params.push(date);
        conditions.push(`res.reservation_date = $${params.length}`);
    }
    if (customer) {
        params.push(`%${customer}%`);
        conditions.push(`(res.customer_name ILIKE $${params.length} OR res.customer_phone ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY res.created_at DESC';

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
            GROUP BY EXTRACT(YEAR FROM created_at), EXTRACT(MONTH FROM created_at)
            ORDER BY year DESC, month DESC
            LIMIT 12
        `;
        const popularRoutesQuery = `
            SELECT r.origin, r.destination, COUNT(res.id) as reservations
            FROM reservations res
            JOIN schedules s ON res.schedule_id = s.id
            JOIN routes r ON s.route_id = r.id
            WHERE res.status = 'confirmed'
            GROUP BY r.origin, r.destination
            ORDER BY reservations DESC
            LIMIT 10
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

// Add new route
router.post('/routes', checkAdmin, async (req, res) => {
    const { origin, destination, distance_km, base_price } = req.body;
    const db = req.db;

    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const result = await db.query(`
            INSERT INTO routes (origin, destination, distance_km, base_price)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [origin, destination, distance_km, base_price]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al agregar ruta:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Add new bus
router.post('/buses', checkAdmin, async (req, res) => {
    const { bus_number, capacity, bus_type } = req.body;
    const db = req.db;

    if (!bus_number || !capacity || !bus_type) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const busResult = await db.query(`
            INSERT INTO buses (bus_number, capacity, bus_type)
            VALUES ($1, $2, $3)
            RETURNING *
        `, [bus_number, capacity, bus_type]);

        const busId = busResult.rows[0].id;

        const seatPromises = [];
        for (let i = 1; i <= capacity; i++) {
            const seatNumber = i.toString().padStart(2, '0');
            const isPremium = (bus_type === 'ejecutivo' && i <= 12) || (bus_type === 'primera_clase' && i <= 8);
            const seatType = isPremium ? 'premium' : 'standard';
            const priceModifier = isPremium ? 1.25 : 1.0;
            
            seatPromises.push(db.query(`
                INSERT INTO seats (bus_id, seat_number, seat_type, price_modifier)
                VALUES ($1, $2, $3, $4)
            `, [busId, seatNumber, seatType, priceModifier]));
        }

        await Promise.all(seatPromises);

        res.json(busResult.rows[0]);
    } catch (err) {
        console.error('Error al agregar autobús:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Add new schedule
router.post('/schedules', checkAdmin, async (req, res) => {
    const { route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier } = req.body;
    const db = req.db;

    if (!route_id || !bus_id || !departure_time || !arrival_time || !days_of_week) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const result = await db.query(`
            INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [route_id, bus_id, departure_time, arrival_time, JSON.stringify(days_of_week), price_multiplier || 1.0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al agregar horario:', err);
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

// Update a route
router.put('/routes/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { origin, destination, distance_km, base_price } = req.body;

    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    try {
        const result = await req.db.query(`
            UPDATE routes
            SET origin = $1, destination = $2, distance_km = $3, base_price = $4
            WHERE id = $5
            RETURNING *
        `, [origin, destination, distance_km, base_price, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar ruta:', err);
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
