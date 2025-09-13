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
            SELECT 
                s.id as schedule_id, 
                s.departure_time, 
                s.arrival_time, 
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
