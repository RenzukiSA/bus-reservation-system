const express = require('express');
const router = express.Router();

// Helper function to normalize strings (remove accents and convert to lowercase)
const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// Get all available routes
router.get('/routes', async (req, res) => {
    try {
        const result = await req.db.query('SELECT DISTINCT origin, destination FROM routes ORDER BY origin, destination');
        const routesByOrigin = {};
        result.rows.forEach(row => {
            if (!routesByOrigin[row.origin]) {
                routesByOrigin[row.origin] = [];
            }
            routesByOrigin[row.origin].push(row.destination);
        });
        res.json(routesByOrigin);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error al obtener las rutas' });
    }
});

// Search schedules for a specific route and date
router.get('/schedules', async (req, res) => {
    const { origin, destination, date } = req.query;
    
    if (!origin || !destination || !date) {
        return res.status(400).json({ error: 'Origin, destination, and date are required' });
    }
    
    const normalizedOrigin = normalizeString(origin);
    const normalizedDestination = normalizeString(destination);

    const query = `
        SELECT 
            s.id as schedule_id,
            s.departure_time,
            s.arrival_time,
            s.price_multiplier,
            r.base_price,
            r.distance_km,
            b.bus_number,
            b.capacity,
            b.bus_type,
            b.id as bus_id
        FROM schedules s
        JOIN routes r ON s.route_id = r.id
        JOIN buses b ON s.bus_id = b.id
        WHERE r.origin = $1 AND r.destination = $2
          AND (s.days_of_week LIKE '%"daily"%' OR s.days_of_week LIKE $3)
    `;

    try {
        const result = await req.db.query(query, [normalizedOrigin, normalizedDestination, `%"${new Date(date).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()}"%`]);
        const schedulePromises = result.rows.map(schedule => {
            return new Promise((resolve) => {
                // Get reserved seats for this schedule and date
                req.db.query(`
                    SELECT seats_reserved, reservation_type
                    FROM reservations
                    WHERE schedule_id = $1 
                    AND reservation_date = $2
                    AND status IN ('pending', 'confirmed')
                `, [schedule.schedule_id, date], (err, reservations) => {
                    if (err) {
                        resolve({ ...schedule, available_seats: 0, is_full_bus_available: false });
                        return;
                    }
                    
                    let reservedSeats = [];
                    let hasFullBusReservation = false;
                    
                    reservations.forEach(reservation => {
                        if (reservation.reservation_type === 'full_bus') {
                            hasFullBusReservation = true;
                        } else if (reservation.seats_reserved) {
                            try {
                                const seats = JSON.parse(reservation.seats_reserved);
                                reservedSeats = reservedSeats.concat(seats);
                            } catch (e) {
                                console.error('Error parsing seats_reserved:', e);
                            }
                        }
                    });
                    
                    const availableSeats = hasFullBusReservation ? 0 : schedule.capacity - reservedSeats.length;
                    const isFullBusAvailable = !hasFullBusReservation && reservedSeats.length === 0;
                    
                    resolve({
                        ...schedule,
                        available_seats: availableSeats,
                        is_full_bus_available: isFullBusAvailable,
                        base_total_price: (schedule.base_price * schedule.price_multiplier).toFixed(2),
                        full_bus_price: (schedule.base_price * schedule.price_multiplier * schedule.capacity * 0.9).toFixed(2) // 10% discount for full bus
                    });
                });
            });
        });
        
        Promise.all(schedulePromises).then(schedulesWithAvailability => {
            res.json(schedulesWithAvailability);
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error al obtener los horarios' });
    }
});

// Get seat map for a specific bus and schedule
router.get('/seats/:scheduleId', async (req, res) => {
    const { scheduleId } = req.params;
    const { date } = req.query;
    
    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
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
        const result = await req.db.query(query, [scheduleId, date]);
        const busInfoQuery = `
            SELECT b.id as bus_id, b.capacity, b.bus_type
            FROM schedules s
            JOIN buses b ON s.bus_id = b.id
            WHERE s.id = $1
        `;
        const busInfoResult = await req.db.query(busInfoQuery, [scheduleId]);
        const busInfo = busInfoResult.rows[0];
        
        let reservedSeatIds = [];
        let hasFullBusReservation = false;
        
        const reservationsQuery = `
            SELECT seats_reserved, reservation_type
            FROM reservations
            WHERE schedule_id = $1 
            AND reservation_date = $2
            AND status IN ('pending', 'confirmed')
        `;
        const reservationsResult = await req.db.query(reservationsQuery, [scheduleId, date]);
        reservationsResult.rows.forEach(reservation => {
            if (reservation.reservation_type === 'full_bus') {
                hasFullBusReservation = true;
            } else if (reservation.seats_reserved) {
                try {
                    const seatIds = JSON.parse(reservation.seats_reserved);
                    reservedSeatIds = reservedSeatIds.concat(seatIds);
                } catch (e) {
                    console.error('Error parsing seats_reserved:', e);
                }
            }
        });
        
        // Mark seats as available/reserved
        const seatMap = result.rows.map(seat => ({
            ...seat,
            is_available: !hasFullBusReservation && !reservedSeatIds.includes(seat.id)
        }));
        
        res.json({
            bus_info: busInfo,
            seats: seatMap,
            has_full_bus_reservation: hasFullBusReservation
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Error al obtener los asientos' });
    }
});

module.exports = router;
