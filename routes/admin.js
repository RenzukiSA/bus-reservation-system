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
                s.id,
                s.route_id,
                s.bus_id,
                s.departure_time,
                s.arrival_time,
                s.status,
                r.origin,
                r.destination,
                s.price_multiplier,
                b.bus_number
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

// Get specific schedule for admin
router.get('/schedules/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const db = req.db;
    try {
        const result = await db.query(`
            SELECT 
                s.id,
                s.route_id,
                s.bus_id,
                s.departure_time,
                s.arrival_time,
                s.days_of_week,
                s.price_multiplier,
                s.status
            FROM schedules s
            WHERE s.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener horario:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Create new schedule
router.post('/schedules', checkAdmin, async (req, res) => {
    const { route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier = 1.0, status = 'active' } = req.body;
    
    if (!route_id || !bus_id || !departure_time || !arrival_time || !days_of_week) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    const db = req.db;
    try {
        // Verificar que la ruta existe
        const routeCheck = await db.query('SELECT id FROM routes WHERE id = $1', [route_id]);
        if (routeCheck.rows.length === 0) {
            return res.status(400).json({ error: 'La ruta especificada no existe' });
        }
        
        // Verificar que el autobús existe y está activo
        const busCheck = await db.query('SELECT id FROM buses WHERE id = $1 AND status = $2', [bus_id, 'active']);
        if (busCheck.rows.length === 0) {
            return res.status(400).json({ error: 'El autobús especificado no existe o no está activo' });
        }
        
        // Crear el horario
        const result = await db.query(`
            INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier, status) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `, [route_id, bus_id, departure_time, arrival_time, JSON.stringify(days_of_week), price_multiplier, status]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear horario:', err);
        res.status(500).json({ error: 'Error al crear horario' });
    }
});

// Update schedule
router.put('/schedules/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier, status } = req.body;

    if (!route_id || !bus_id || !departure_time || !arrival_time || !days_of_week || !price_multiplier || !status) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const db = req.db;
    try {
        // Verificar que el horario, la ruta y el autobús existen
        const checks = await Promise.all([
            db.query('SELECT id FROM schedules WHERE id = $1', [id]),
            db.query('SELECT id FROM routes WHERE id = $1', [route_id]),
            db.query('SELECT id FROM buses WHERE id = $1', [bus_id])
        ]);

        if (checks.some(check => check.rows.length === 0)) {
            return res.status(404).json({ error: 'El horario, la ruta o el autobús no fueron encontrados.' });
        }

        // Actualizar el horario
        const result = await db.query(`
            UPDATE schedules 
            SET route_id = $1, bus_id = $2, departure_time = $3, arrival_time = $4, days_of_week = $5, price_multiplier = $6, status = $7
            WHERE id = $8
            RETURNING *
        `, [route_id, bus_id, departure_time, arrival_time, JSON.stringify(days_of_week), price_multiplier, status, id]);
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar horario:', err);
        res.status(500).json({ error: 'Error al actualizar horario' });
    }
});

// Delete schedule
router.delete('/schedules/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const db = req.db;
    
    try {
        // Verificar que no hay reservas activas para este horario
        const reservationsCheck = await db.query(
            'SELECT id FROM reservations WHERE schedule_id = $1 AND status IN ($2, $3)', 
            [id, 'pending', 'confirmed']
        );
        
        if (reservationsCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el horario porque tiene reservas activas' 
            });
        }
        
        // Eliminar el horario
        const result = await db.query('DELETE FROM schedules WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        
        res.json({ message: 'Horario eliminado exitosamente' });
    } catch (err) {
        console.error('Error al eliminar horario:', err);
        res.status(500).json({ error: 'Error al eliminar horario' });
    }
});

// Update reservation status
router.put('/reservations/:id/status', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    
    const db = req.db;
    try {
        const result = await db.query(
            'UPDATE reservations SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar estado de reservación:', err);
        res.status(500).json({ error: 'Error al actualizar reservación' });
    }
});




module.exports = router;

