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
        return res.status(400).json({ error: 'La configuración del servidor es incorrecta o falta la contraseña.' });
    }

    try {
        const match = await bcrypt.compare(password, adminPasswordHash);
        if (match) {
            req.session.isAdmin = true;
            return res.json({ success: true, message: 'Inicio de sesión exitoso.' });
        } else {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });
        }
    } catch (err) {
        console.error('Error durante el inicio de sesión del administrador:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Admin logout
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

// Actualizar el estado de una reservación
router.put('/reservations/:id/status', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Estado no válido.' });
    }

    try {
        const result = await req.db.query(
            'UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada.' });
        }

        // TODO: Si se cancela, se deberían liberar los asientos.

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar el estado de la reservación:', err);
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

// --- Rutas CRUD ---

// Obtener todas las rutas
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

// Crear una nueva ruta
router.post('/routes', checkAdmin, async (req, res) => {
    const { origin, destination } = req.body;
    if (!origin || !destination) {
        return res.status(400).json({ error: 'Origen y destino son requeridos.' });
    }
    try {
        const result = await req.db.query(
            'INSERT INTO routes (origin, destination) VALUES ($1, $2) RETURNING *',
            [origin, destination]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear la ruta:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Actualizar una ruta
router.put('/routes/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { origin, destination } = req.body;
    if (!origin || !destination) {
        return res.status(400).json({ error: 'Origen y destino son requeridos.' });
    }
    try {
        const result = await req.db.query(
            'UPDATE routes SET origin = $1, destination = $2 WHERE id = $3 RETURNING *',
            [origin, destination, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar la ruta:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Eliminar una ruta
router.delete('/routes/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await req.db.query('DELETE FROM routes WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada.' });
        }
        res.status(204).send(); // No content
    } catch (err) {
        console.error('Error al eliminar la ruta:', err);
        // Manejar error de llave foránea (si una ruta está en uso)
        if (err.code === '23503') {
            return res.status(400).json({ error: 'No se puede eliminar la ruta porque está siendo utilizada en uno o más horarios.' });
        }
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

