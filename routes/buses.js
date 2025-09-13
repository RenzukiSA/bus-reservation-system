const express = require('express');
const router = express.Router();

// Función para normalizar strings (quitar acentos y a minúsculas)
const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// Obtener todas las rutas de origen y destino
router.get('/routes', async (req, res) => {
    try {
        const result = await req.db.query('SELECT DISTINCT origin, destination FROM routes ORDER BY origin, destination');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener las rutas:', err.message);
        res.status(500).json({ error: 'Error al obtener las rutas' });
    }
});

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
            SELECT s.id, s.departure_time, s.arrival_time, b.type as bus_type, b.capacity, r.base_price * s.price_multiplier as final_price
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
                [schedule.id, date]
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
                full_bus_price: (schedule.final_price * schedule.capacity * 0.9).toFixed(2)
            };
        }));

        res.json(schedulesWithAvailability);

    } catch (err) {
        console.error('Error al obtener los horarios:', err);
        res.status(500).json({ error: 'Error interno del servidor al buscar horarios' });
    }
});

// Obtener el estado de los asientos para un horario y fecha específicos
router.get('/seats', async (req, res) => {
    const { schedule_id, date } = req.query;
    if (!schedule_id || !date) {
        return res.status(400).json({ error: 'Faltan parámetros: schedule_id o date' });
    }

    const query = `
        SELECT s.id, s.seat_number, s.seat_type, s.price_modifier,
               CASE WHEN res.id IS NOT NULL THEN 'occupied' ELSE 'available' END as status
        FROM seats s
        JOIN schedules sch ON s.bus_id = sch.bus_id
        LEFT JOIN reservations res ON res.schedule_id = sch.id 
                                  AND res.reservation_date = $2
                                  AND res.status IN ('confirmed', 'pending')
                                  AND (res.seats_reserved LIKE CONCAT('%"', s.id, '"%') OR res.reservation_type = 'full_bus')
        WHERE sch.id = $1
        ORDER BY s.id;
    `;

    try {
        const result = await req.db.query(query, [schedule_id, date]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener los asientos:', err.message);
        res.status(500).json({ error: 'Error al obtener los asientos' });
    }
});

module.exports = router;
