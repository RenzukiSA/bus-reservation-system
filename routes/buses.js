const express = require('express');
const router = express.Router();

// Middleware para verificar si el usuario es administrador
const checkAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado.' });
    }
};

// --- ENDPOINTS PARA GESTIÓN DE AUTOBUSES ---

// Obtener todos los autobuses
router.get('/', async (req, res) => {
    try {
        const result = await req.db.query('SELECT * FROM buses ORDER BY id');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener autobuses:', err.message);
        res.status(500).json({ error: 'Error al obtener autobuses' });
    }
});

// Obtener un autobús específico
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await req.db.query('SELECT * FROM buses WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Autobús no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener autobús:', err.message);
        res.status(500).json({ error: 'Error al obtener autobús' });
    }
});

// Crear un nuevo autobús
router.post('/', checkAdmin, async (req, res) => {
    const { bus_number, type, capacity, status = 'active' } = req.body;
    
    if (!bus_number || !type || !capacity) {
        return res.status(400).json({ error: 'Número de autobús, tipo y capacidad son requeridos' });
    }
    
    const client = await req.db.connect();
    try {
        await client.query('BEGIN');

        // Verificar que el número de autobús no exista
        const existingBus = await client.query('SELECT id FROM buses WHERE bus_number = $1', [bus_number]);
        if (existingBus.rows.length > 0) {
            throw new Error('Ya existe un autobús con ese número');
        }

        const result = await client.query(
            'INSERT INTO buses (bus_number, type, capacity, status) VALUES ($1, $2, $3, $4) RETURNING *',
            [bus_number, type, capacity, status]
        );

        const bus = result.rows[0];
        await createSeatsForBus(client, bus.id, bus.capacity);

        await client.query('COMMIT');
        res.status(201).json(bus);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear autobús:', err.message);
        // Enviar el mensaje de error específico al cliente
        const errorMessage = err.message.includes('Ya existe un autobús') 
            ? err.message 
            : 'Error al crear el autobús en la base de datos.';
        res.status(500).json({ error: errorMessage });
    } finally {
        client.release();
    }
});

// Actualizar un autobús
router.put('/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await req.db.connect();

    try {
        await client.query('BEGIN');

        const existingBusResult = await client.query('SELECT * FROM buses WHERE id = $1', [id]);
        if (existingBusResult.rows.length === 0) {
            throw new Error('Autobús no encontrado');
        }
        const existingBus = existingBusResult.rows[0];

        const fields = {
            bus_number: req.body.bus_number || existingBus.bus_number,
            type: req.body.type || existingBus.type,
            capacity: req.body.capacity ? parseInt(req.body.capacity) : existingBus.capacity,
            status: req.body.status || existingBus.status
        };

        if (fields.bus_number !== existingBus.bus_number) {
            const duplicateBus = await client.query('SELECT id FROM buses WHERE bus_number = $1 AND id != $2', [fields.bus_number, id]);
            if (duplicateBus.rows.length > 0) {
                throw new Error('Ya existe otro autobús con ese número');
            }
        }

        if (fields.capacity !== existingBus.capacity) {
            const reservationCheck = await client.query('SELECT id FROM reservations WHERE bus_id = $1 AND status IN ($2, $3) LIMIT 1', [id, 'pending', 'confirmed']);
            if (reservationCheck.rows.length > 0) {
                throw new Error('No se puede cambiar la capacidad de un autobús con reservas existentes.');
            }
            await updateSeatsForBus(client, id, fields.capacity);
        }

        const result = await client.query(
            'UPDATE buses SET bus_number = $1, type = $2, capacity = $3, status = $4 WHERE id = $5 RETURNING *',
            [fields.bus_number, fields.type, fields.capacity, fields.status, id]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar autobús:', err.message);
        res.status(500).json({ error: err.message || 'Error al actualizar el autobús.' });
    } finally {
        client.release();
    }
});

// Eliminar un autobús
router.delete('/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const client = await req.db.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar que no hay reservas para ningún horario de este autobús
        const reservationCheck = await client.query(
            `SELECT r.id FROM reservations r
             JOIN schedules s ON r.schedule_id = s.id
             WHERE s.bus_id = $1 AND r.status IN ('pending', 'confirmed')
             LIMIT 1`,
            [id]
        );

        if (reservationCheck.rows.length > 0) {
            throw new Error('No se puede eliminar: el autobús tiene reservas activas o pendientes.');
        }

        // 2. Verificar que no hay horarios activos
        const scheduleCheck = await client.query('SELECT id FROM schedules WHERE bus_id = $1 AND status = $2 LIMIT 1', [id, 'active']);
        if (scheduleCheck.rows.length > 0) {
            throw new Error('No se puede eliminar: el autobús está asignado a horarios activos.');
        }

        // 3. Eliminar asientos (ahora es seguro hacerlo)
        await client.query('DELETE FROM seats WHERE bus_id = $1', [id]);

        // 4. Eliminar el autobús
        const result = await client.query('DELETE FROM buses WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            throw new Error('Autobús no encontrado');
        }

        await client.query('COMMIT');
        res.json({ message: 'Autobús eliminado exitosamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al eliminar autobús:', err.message);
        res.status(500).json({ error: err.message || 'Error al eliminar el autobús.' });
    } finally {
        client.release();
    }
});

// Función auxiliar para crear asientos
async function createSeatsForBus(client, busId, capacity) {
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (let i = 1; i <= capacity; i++) {
        const seatType = i <= 4 ? 'premium' : 'standard'; // Primeros 4 asientos son premium
        const priceModifier = seatType === 'premium' ? 1.2 : 1.0;
        
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(busId, i, seatType, priceModifier);
    }
    
    if (values.length > 0) {
        const query = `INSERT INTO seats (bus_id, seat_number, seat_type, price_modifier) VALUES ${placeholders.join(', ')}`;
        return client.query(query, values);
    }
}

// Función auxiliar para actualizar asientos cuando cambia la capacidad
async function updateSeatsForBus(client, busId, newCapacity) {
    // Eliminar todos los asientos existentes
    await client.query('DELETE FROM seats WHERE bus_id = $1', [busId]);
    // Crear nuevos asientos
    await createSeatsForBus(client, busId, newCapacity);
}

// Función para normalizar strings (quitar acentos y a minúsculas)
const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// Obtener horarios disponibles para una ruta y fecha
router.get('/schedules', async (req, res) => {
    const { origin, destination, date } = req.query;
    if (!origin || !destination || !date) {
        return res.status(400).json({ error: 'Faltan parámetros: origen, destino o fecha' });
    }

    try {
        // 1. Encontrar la ruta
        const allRoutesResult = await req.db.query('SELECT id, origin, destination FROM routes');
        const normalizedOrigin = normalizeString(origin);
        const normalizedDestination = normalizeString(destination);
        const matchedRoute = allRoutesResult.rows.find(r => 
            normalizeString(r.origin) === normalizedOrigin && normalizeString(r.destination) === normalizedDestination
        );

        if (!matchedRoute) {
            return res.json([]);
        }

        // 2. Buscar horarios
        const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        
        const schedulesQuery = `
            SELECT 
                s.id as schedule_id, 
                s.departure_time, 
                s.arrival_time, 
                b.id as bus_id,
                b.type as bus_type, 
                b.capacity, 
                b.bus_number,
                r.base_price * s.price_multiplier as base_total_price
            FROM schedules s
            JOIN routes r ON s.route_id = r.id
            JOIN buses b ON s.bus_id = b.id
            WHERE r.id = $1 AND (s.days_of_week LIKE '%"daily"%' OR s.days_of_week LIKE $2)
            ORDER BY s.departure_time;
        `;
        const queryParams = [matchedRoute.id, `%"${dayOfWeek}"%`];

        const schedulesResult = await req.db.query(schedulesQuery, queryParams);
        const schedules = schedulesResult.rows;

        // 3. Calcular disponibilidad
        const schedulesWithAvailability = await Promise.all(schedules.map(async (schedule) => {
            const reservationsResult = await req.db.query(
                `SELECT reservation_type, seats_reserved FROM reservations WHERE schedule_id = $1 AND reservation_date = $2 AND status IN ('pending', 'confirmed')`,
                [schedule.schedule_id, date]
            );

            let reservedSeatIds = [];
            let isFullBusReserved = false;
            reservationsResult.rows.forEach(r => {
                if (r.reservation_type === 'full_bus') isFullBusReserved = true;
                else if (r.seats_reserved) reservedSeatIds.push(...JSON.parse(r.seats_reserved));
            });

            const availableSeats = isFullBusReserved ? 0 : schedule.capacity - reservedSeatIds.length;
            const isFullBusAvailable = !isFullBusReserved && reservedSeatIds.length === 0;

            return {
                ...schedule,
                available_seats: availableSeats,
                is_full_bus_available: isFullBusAvailable,
                full_bus_price: (schedule.base_total_price * schedule.capacity * 0.9).toFixed(2)
            };
        }));

        res.json(schedulesWithAvailability);

    } catch (err) {
        console.error('Error al obtener los horarios:', err);
        res.status(500).json({ error: 'Error interno del servidor al buscar horarios' });
    }
});

// Obtener el estado de los asientos para un horario y fecha específicos
router.get('/seats/:schedule_id', async (req, res) => {
    const { schedule_id } = req.params;
    const { date } = req.query;

    if (!schedule_id || !date) {
        return res.status(400).json({ error: 'Faltan parámetros: schedule_id o date' });
    }

    try {
        // Primero, obtener el bus_id del schedule
        const scheduleRes = await req.db.query('SELECT bus_id FROM schedules WHERE id = $1', [schedule_id]);
        if (scheduleRes.rowCount === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        const busId = scheduleRes.rows[0].bus_id;

        // Obtener todos los asientos para ese bus
        const seatsRes = await req.db.query('SELECT id, seat_number, seat_type, price_modifier FROM seats WHERE bus_id = $1 ORDER BY id', [busId]);
        const allSeats = seatsRes.rows;

        // Obtener las reservas para ese horario y fecha
        const reservationsRes = await req.db.query(
            `SELECT reservation_type, seats_reserved FROM reservations WHERE schedule_id = $1 AND reservation_date = $2 AND status IN ('pending', 'confirmed')`,
            [schedule_id, date]
        );

        let reservedSeatIds = new Set();
        let hasFullBusReservation = false;
        reservationsRes.rows.forEach(r => {
            if (r.reservation_type === 'full_bus') {
                hasFullBusReservation = true;
            } else if (r.seats_reserved) {
                JSON.parse(r.seats_reserved).forEach(id => reservedSeatIds.add(id));
            }
        });

        // Mapear los asientos con su disponibilidad
        const seatsWithStatus = allSeats.map(seat => ({
            ...seat,
            is_available: !hasFullBusReservation && !reservedSeatIds.has(seat.id)
        }));

        res.json({
            seats: seatsWithStatus,
            has_full_bus_reservation: hasFullBusReservation
        });

    } catch (err) {
        console.error('Error al obtener los asientos:', err);
        res.status(500).json({ error: 'Error interno del servidor al obtener los asientos' });
    }
});

module.exports = router;
