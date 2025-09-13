const express = require('express');
const router = express.Router();

// Helper function to normalize strings (remove accents and convert to lowercase)
const normalizeString = (str) => {
    if (!str) return '';
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// Get all available routes
router.get('/routes', (req, res) => {
    const db = req.db;
    
    db.all(`
        SELECT DISTINCT origin, destination 
        FROM routes 
        ORDER BY origin, destination
    `, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        
        // Group by origin for easier frontend handling
        const routesByOrigin = {};
        rows.forEach(row => {
            if (!routesByOrigin[row.origin]) {
                routesByOrigin[row.origin] = [];
            }
            routesByOrigin[row.origin].push(row.destination);
        });
        
        res.json(routesByOrigin);
    });
});

// Search schedules for a specific route and date
router.get('/schedules', (req, res) => {
    const { origin, destination, date } = req.query;
    
    if (!origin || !destination || !date) {
        return res.status(400).json({ error: 'Origin, destination, and date are required' });
    }
    
    const db = req.db;
    const normalizedOrigin = normalizeString(origin);
    const normalizedDestination = normalizeString(destination);

    // 1. Find the matching route ID by normalizing and comparing in JS
    db.all('SELECT * FROM routes', [], (err, allRoutes) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        console.log('--- Inicia Depuración de Búsqueda ---');
        console.log(`Buscando: Origen='${normalizedOrigin}', Destino='${normalizedDestination}'`);

        const matchedRoute = allRoutes.find(route => {
            const dbOrigin = normalizeString(route.origin);
            const dbDestination = normalizeString(route.destination);

            // Log para cada ruta en la base de datos
            console.log(`Comparando: (DB) '${dbOrigin}|${dbDestination}' === (Búsqueda) '${normalizedOrigin}|${normalizedDestination}'`);

            return dbOrigin === normalizedOrigin && dbDestination === normalizedDestination;
        });

        console.log('--- Fin Depuración de Búsqueda ---');

        if (!matchedRoute) {
            console.log('Resultado: No se encontró ninguna ruta coincidente.');
            return res.json([]); // No route found, return empty array
        }

        console.log(`Resultado: Ruta encontrada con ID=${matchedRoute.id}`);

        // 2. Now, find schedules for the matched route ID
        const dateObj = new Date(date + 'T00:00:00');
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayOfWeek = dayNames[dateObj.getDay()];

        db.all(`
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
            WHERE s.route_id = ?
            AND s.status = 'active'
            AND b.status = 'active'
            AND s.days_of_week LIKE ?
            ORDER BY s.departure_time
        `, [matchedRoute.id, `%"${dayOfWeek}"%`], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // For each schedule, get seat availability
            const schedulePromises = rows.map(schedule => {
                return new Promise((resolve) => {
                    // Get reserved seats for this schedule and date
                    db.all(`
                        SELECT seats_reserved, reservation_type
                        FROM reservations
                        WHERE schedule_id = ? 
                        AND reservation_date = ?
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
        });
    });
});

// Get seat map for a specific bus and schedule
router.get('/seats/:scheduleId', (req, res) => {
    const { scheduleId } = req.params;
    const { date } = req.query;
    
    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }
    
    const db = req.db;
    
    // First get the bus info for this schedule
    db.get(`
        SELECT b.id as bus_id, b.capacity, b.bus_type
        FROM schedules s
        JOIN buses b ON s.bus_id = b.id
        WHERE s.id = ?
    `, [scheduleId], (err, busInfo) => {
        if (err || !busInfo) {
            return res.status(500).json({ error: 'Schedule not found' });
        }
        
        // Get all seats for this bus
        db.all(`
            SELECT id, seat_number, seat_type, price_modifier
            FROM seats
            WHERE bus_id = ?
            ORDER BY CAST(seat_number AS INTEGER)
        `, [busInfo.bus_id], (err, seats) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            // Get reserved seats for this schedule and date
            db.all(`
                SELECT seats_reserved, reservation_type
                FROM reservations
                WHERE schedule_id = ? 
                AND reservation_date = ?
                AND status IN ('pending', 'confirmed')
            `, [scheduleId, date], (err, reservations) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                
                let reservedSeatIds = [];
                let hasFullBusReservation = false;
                
                reservations.forEach(reservation => {
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
                const seatMap = seats.map(seat => ({
                    ...seat,
                    is_available: !hasFullBusReservation && !reservedSeatIds.includes(seat.id)
                }));
                
                res.json({
                    bus_info: busInfo,
                    seats: seatMap,
                    has_full_bus_reservation: hasFullBusReservation
                });
            });
        });
    });
});

module.exports = router;
