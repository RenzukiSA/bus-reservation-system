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
router.get('/dashboard', checkAdmin, (req, res) => {
    const db = req.db;

    const stats = {};

    // Get total reservations by status
    db.all(`
        SELECT status, COUNT(*) as count
        FROM reservations
        GROUP BY status
    `, (err, statusCounts) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        stats.reservations_by_status = statusCounts;

        // Get revenue by month
        db.all(`
            SELECT 
                strftime('%Y-%m', created_at) as month,
                SUM(total_price) as revenue,
                COUNT(*) as reservations
            FROM reservations
            WHERE status = 'confirmed'
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month DESC
            LIMIT 12
        `, (err, monthlyRevenue) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            stats.monthly_revenue = monthlyRevenue;

            // Get popular routes
            db.all(`
                SELECT 
                    r.origin,
                    r.destination,
                    COUNT(*) as reservations,
                    SUM(res.total_price) as total_revenue
                FROM reservations res
                JOIN schedules s ON res.schedule_id = s.id
                JOIN routes r ON s.route_id = r.id
                WHERE res.status = 'confirmed'
                GROUP BY r.origin, r.destination
                ORDER BY reservations DESC
                LIMIT 10
            `, (err, popularRoutes) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                stats.popular_routes = popularRoutes;

                // Get bus utilization
                db.all(`
                    SELECT 
                        b.bus_number,
                        b.bus_type,
                        COUNT(res.id) as total_reservations,
                        AVG(
                            CASE 
                                WHEN res.reservation_type = 'full_bus' THEN b.capacity
                                ELSE (
                                    SELECT COUNT(*) 
                                    FROM json_each(res.seats_reserved)
                                )
                            END
                        ) as avg_seats_per_trip
                    FROM buses b
                    LEFT JOIN schedules s ON b.id = s.bus_id
                    LEFT JOIN reservations res ON s.id = res.schedule_id AND res.status = 'confirmed'
                    GROUP BY b.id, b.bus_number, b.bus_type
                    ORDER BY total_reservations DESC
                `, (err, busUtilization) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    stats.bus_utilization = busUtilization;
                    res.json(stats);
                });
            });
        });
    });
});

// Add new route
router.post('/routes', checkAdmin, (req, res) => {
    const { origin, destination, distance_km, base_price } = req.body;
    const db = req.db;

    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.run(`
        INSERT INTO routes (origin, destination, distance_km, base_price)
        VALUES (?, ?, ?, ?)
    `, [origin, destination, distance_km, base_price], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({
            id: this.lastID,
            message: 'Route added successfully'
        });
    });
});

// Add new bus
router.post('/buses', checkAdmin, (req, res) => {
    const { bus_number, capacity, bus_type } = req.body;
    const db = req.db;

    if (!bus_number || !capacity || !bus_type) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.run(`
        INSERT INTO buses (bus_number, capacity, bus_type)
        VALUES (?, ?, ?)
    `, [bus_number, capacity, bus_type], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const busId = this.lastID;

        // Create seats for the new bus
        const seatPromises = [];
        for (let i = 1; i <= capacity; i++) {
            const seatNumber = i.toString().padStart(2, '0');
            const seatType = i <= 4 ? 'premium' : 'standard';
            const priceModifier = seatType === 'premium' ? 1.2 : 1.0;
            
            seatPromises.push(new Promise((resolve) => {
                db.run(`
                    INSERT INTO seats (bus_id, seat_number, seat_type, price_modifier)
                    VALUES (?, ?, ?, ?)
                `, [busId, seatNumber, seatType, priceModifier], resolve);
            }));
        }

        Promise.all(seatPromises).then(() => {
            res.json({
                id: busId,
                message: 'Bus and seats added successfully'
            });
        });
    });
});

// Add new schedule
router.post('/schedules', checkAdmin, (req, res) => {
    const { route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier } = req.body;
    const db = req.db;

    if (!route_id || !bus_id || !departure_time || !arrival_time || !days_of_week) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    db.run(`
        INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [route_id, bus_id, departure_time, arrival_time, JSON.stringify(days_of_week), price_multiplier || 1.0], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({
            id: this.lastID,
            message: 'Schedule added successfully'
        });
    });
});

// Get all routes for admin
router.get('/routes', checkAdmin, (req, res) => {
    const db = req.db;

    db.all('SELECT * FROM routes ORDER BY origin, destination', (err, routes) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(routes);
    });
});

// Update a route
router.put('/routes/:id', checkAdmin, (req, res) => {
    const { id } = req.params;
    const { origin, destination, distance_km, base_price } = req.body;

    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    const db = req.db;
    db.run(`
        UPDATE routes
        SET origin = ?, destination = ?, distance_km = ?, base_price = ?
        WHERE id = ?
    `, [origin, destination, distance_km, base_price, id], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        res.json({ message: 'Ruta actualizada exitosamente' });
    });
});

// Get all buses for admin
router.get('/buses', checkAdmin, (req, res) => {
    const db = req.db;

    db.all('SELECT * FROM buses ORDER BY bus_number', (err, buses) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(buses);
    });
});

// Get all schedules for admin
router.get('/schedules', checkAdmin, (req, res) => {
    const db = req.db;

    db.all(`
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
    `, (err, schedules) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(schedules);
    });
});

module.exports = router;
