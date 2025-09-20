const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../database/db');

// Middleware para verificar si el usuario es administrador
const requireAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado. Se requiere iniciar sesión como administrador.' });
    }
};

// --- Autenticación ---

// Endpoint para obtener un token CSRF
router.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Login
router.post('/login', async (req, res) => {
    const { password, totp_token } = req.body;

    // 1. Validar que la contraseña del administrador esté configurada
    if (!process.env.ADMIN_PASSWORD_HASH) {
        console.error('El hash de la contraseña de administrador no está configurado.');
        return res.status(500).json({ success: false, error: 'Error de configuración del servidor.' });
    }

    try {
        // 2. Comparar el hash de la contraseña
        const passwordMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
        
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: 'Credenciales incorrectas.' });
        }

        // 3. (Hook) Verificar token 2FA si está habilitado
        if (process.env.ENABLE_2FA === 'true') {
            // --- INICIO DEL HOOK PARA 2FA ---
            // Aquí iría la lógica para verificar el token TOTP (Time-based One-Time Password)
            // Por ejemplo, usando una librería como `speakeasy` o `otplib`.
            // const isValidToken = verifyTotpToken(totp_token, process.env.ADMIN_2FA_SECRET);
            // if (!isValidToken) {
            //     return res.status(401).json({ success: false, error: 'Token 2FA inválido.' });
            // }
            // --- FIN DEL HOOK PARA 2FA ---
            console.log('2FA está habilitado, pero la lógica de verificación aún no está implementada.');
        }

        // 4. Si todo es correcto, establecer la sesión
        req.session.isAdmin = true;
        res.json({ success: true });

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
router.get('/reservations', requireAdmin, async (req, res) => {
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
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener las reservaciones de admin:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Get dashboard statistics
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
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
            pool.query(statusQuery),
            pool.query(revenueQuery),
            pool.query(popularRoutesQuery)
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

// Get all schedules for admin
router.get('/schedules', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
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
router.get('/schedules/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
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
router.post('/schedules', requireAdmin, async (req, res) => {
    const { route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier = 1.0, status = 'active' } = req.body;
    
    if (!route_id || !bus_id || !departure_time || !arrival_time || !days_of_week) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    try {
        // Verificar que la ruta existe
        const routeCheck = await pool.query('SELECT id FROM routes WHERE id = $1', [route_id]);
        if (routeCheck.rows.length === 0) {
            return res.status(400).json({ error: 'La ruta especificada no existe' });
        }
        
        // Verificar que el autobús existe y está activo
        const busCheck = await pool.query('SELECT id FROM buses WHERE id = $1 AND status = $2', [bus_id, 'active']);
        if (busCheck.rows.length === 0) {
            return res.status(400).json({ error: 'El autobús especificado no existe o no está activo' });
        }
        
        // Crear el horario
        const result = await pool.query(`
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
router.put('/schedules/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const scheduleResult = await client.query('SELECT * FROM schedules WHERE id = $1', [id]);
        if (scheduleResult.rows.length === 0) {
            throw new Error('Horario no encontrado');
        }
        const existingSchedule = scheduleResult.rows[0];

        const fields = {
            route_id: req.body.route_id || existingSchedule.route_id,
            bus_id: req.body.bus_id || existingSchedule.bus_id,
            departure_time: req.body.departure_time || existingSchedule.departure_time,
            arrival_time: req.body.arrival_time || existingSchedule.arrival_time,
            days_of_week: req.body.days_of_week ? JSON.stringify(req.body.days_of_week) : existingSchedule.days_of_week,
            price_multiplier: req.body.price_multiplier || existingSchedule.price_multiplier,
            status: req.body.status || existingSchedule.status
        };

        const result = await client.query(
            `UPDATE schedules SET route_id = $1, bus_id = $2, departure_time = $3, arrival_time = $4, days_of_week = $5, price_multiplier = $6, status = $7 WHERE id = $8 RETURNING *`,
            [fields.route_id, fields.bus_id, fields.departure_time, fields.arrival_time, fields.days_of_week, fields.price_multiplier, fields.status, id]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar horario:', err.message);
        res.status(500).json({ error: err.message || 'Error al actualizar el horario.' });
    } finally {
        client.release();
    }
});

// Delete schedule
router.delete('/schedules/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const reservationsCheck = await client.query(
            'SELECT id FROM reservations WHERE schedule_id = $1 AND status IN ($2, $3) LIMIT 1',
            [id, 'pending', 'confirmed']
        );

        if (reservationsCheck.rows.length > 0) {
            throw new Error('No se puede eliminar el horario porque tiene reservas activas.');
        }

        const result = await client.query('DELETE FROM schedules WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            throw new Error('Horario no encontrado');
        }

        await client.query('COMMIT');
        res.json({ message: 'Horario eliminado exitosamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar horario:', err.message);
        res.status(500).json({ error: err.message || 'Error al eliminar el horario.' });
    } finally {
        client.release();
    }
});

// Update reservation status
router.put('/reservations/:id/status', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    
    try {
        const result = await pool.query(
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
