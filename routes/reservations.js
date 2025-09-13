const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Create a new reservation
router.post('/', (req, res) => {
    console.log('--- [RESERVA] Iniciando creación de reserva ---');
    console.log('[RESERVA] Body recibido:', req.body);
    const {
        schedule_id,
        reservation_date,
        reservation_type, // 'seats' or 'full_bus'
        selected_seats, // array of seat IDs for individual seat reservations
        customer_name,
        customer_phone,
        customer_email
    } = req.body;

    if (!schedule_id || !reservation_date || !reservation_type || !customer_name || !customer_phone) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (reservation_type === 'seats' && (!selected_seats || selected_seats.length === 0)) {
        return res.status(400).json({ error: 'Selected seats are required for seat reservations' });
    }

    const db = req.db;
    const reservationId = uuidv4();
    const paymentDeadline = new Date(Date.now() + (process.env.RESERVATION_TIMEOUT_MINUTES || 15) * 60 * 1000);

    // First, get schedule and pricing info
    db.get(`
        SELECT 
            s.price_multiplier,
            r.base_price,
            b.capacity,
            b.bus_type
        FROM schedules s
        JOIN routes r ON s.route_id = r.id
        JOIN buses b ON s.bus_id = b.id
        WHERE s.id = ?
    `, [schedule_id], (err, scheduleInfo) => {
        if (err || !scheduleInfo) {
            return res.status(500).json({ error: 'Schedule not found' });
        }

        // Check availability before creating reservation
        db.all(`
            SELECT seats_reserved, reservation_type
            FROM reservations
            WHERE schedule_id = ? 
            AND reservation_date = ?
            AND status IN ('pending', 'confirmed')
        `, [schedule_id, reservation_date], (err, existingReservations) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Check if there's already a full bus reservation
            const hasFullBusReservation = existingReservations.some(r => r.reservation_type === 'full_bus');
            
            if (hasFullBusReservation) {
                return res.status(400).json({ error: 'Bus is fully reserved for this date' });
            }

            // Get currently reserved individual seats
            let reservedSeatIds = [];
            existingReservations.forEach(reservation => {
                if (reservation.seats_reserved) {
                    try {
                        const seatIds = JSON.parse(reservation.seats_reserved);
                        reservedSeatIds = reservedSeatIds.concat(seatIds);
                    } catch (e) {
                        console.error('Error parsing seats_reserved:', e);
                    }
                }
            });

            // Validate reservation type specific constraints
            if (reservation_type === 'full_bus') {
                if (reservedSeatIds.length > 0) {
                    return res.status(400).json({ error: 'Cannot reserve full bus - some seats are already reserved' });
                }
            } else if (reservation_type === 'seats') {
                // Check if any selected seats are already reserved
                const conflictingSeats = selected_seats.filter(seatId => reservedSeatIds.includes(seatId));
                if (conflictingSeats.length > 0) {
                    return res.status(400).json({ error: `Seats ${conflictingSeats.join(', ')} are already reserved` });
                }
            }

            // Calculate total price and create reservation
            if (reservation_type === 'full_bus') {
                // Full bus gets 10% discount
                const totalPrice = scheduleInfo.base_price * scheduleInfo.price_multiplier * scheduleInfo.capacity * 0.9;
                createReservation(totalPrice);
            } else {
                // Get individual seat prices
                console.log('[RESERVA] Calculando precio para asientos:', selected_seats);
                const placeholders = selected_seats.map(() => '?').join(',');
                const query = `SELECT price_modifier FROM seats WHERE id IN (${placeholders})`;

                db.all(query, selected_seats, (err, seatPrices) => {
                    console.log('[RESERVA] Resultado de la consulta de precios:', { err, seatPrices });
                    if (err) {
                        return res.status(500).json({ error: 'Error calculating seat prices' });
                    }

                    const totalPrice = seatPrices.reduce((sum, seat) => {
                        return sum + (scheduleInfo.base_price * scheduleInfo.price_multiplier * seat.price_modifier);
                    }, 0);

                    // Create the reservation with the calculated price
                    createReservation(totalPrice);
                });
            }

            function createReservation(totalPrice) {
                console.log('[RESERVA] Dentro de createReservation. Precio total:', totalPrice);
                const seatsReserved = reservation_type === 'seats' ? JSON.stringify(selected_seats) : null;
                const params = [
                    reservationId, schedule_id, reservation_date, reservation_type,
                    seatsReserved, customer_name, customer_phone, customer_email,
                    totalPrice.toFixed(2), paymentDeadline.toISOString()
                ];

                console.log('[RESERVA] Parámetros para INSERT:', params);

                db.run(`
                    INSERT INTO reservations (
                        id, schedule_id, reservation_date, reservation_type, 
                        seats_reserved, customer_name, customer_phone, customer_email,
                        total_price, payment_deadline
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, params, function(err) {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    res.json({
                        reservation_id: reservationId,
                        total_price: totalPrice.toFixed(2),
                        payment_deadline: paymentDeadline,
                        whatsapp_number: process.env.WHATSAPP_BUSINESS_NUMBER,
                        message: `Reserva creada exitosamente. Tienes ${process.env.RESERVATION_TIMEOUT_MINUTES || 15} minutos para enviar el comprobante de pago por WhatsApp.`
                    });
                });
            }
        });
    });
});

// Get reservation details
router.get('/:reservationId', (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    db.get(`
        SELECT 
            res.*,
            s.departure_time,
            s.arrival_time,
            r.origin,
            r.destination,
            b.bus_number,
            b.bus_type
        FROM reservations res
        JOIN schedules s ON res.schedule_id = s.id
        JOIN routes r ON s.route_id = r.id
        JOIN buses b ON s.bus_id = b.id
        WHERE res.id = ?
    `, [reservationId], (err, reservation) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!reservation) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        // If it's a seat reservation, get seat details
        if (reservation.reservation_type === 'seats' && reservation.seats_reserved) {
            try {
                const seatIds = JSON.parse(reservation.seats_reserved);
                const seatIdsStr = seatIds.join(',');
                
                db.all(`
                    SELECT seat_number, seat_type
                    FROM seats
                    WHERE id IN (${seatIdsStr})
                    ORDER BY CAST(seat_number AS INTEGER)
                `, (err, seats) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }

                    res.json({
                        ...reservation,
                        seats: seats
                    });
                });
            } catch (e) {
                res.json(reservation);
            }
        } else {
            res.json(reservation);
        }
    });
});

// Confirm payment (admin endpoint)
router.put('/:reservationId/confirm', (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    db.run(`
        UPDATE reservations 
        SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
    `, [reservationId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found or already processed' });
        }

        res.json({ message: 'Payment confirmed successfully' });
    });
});

// Cancel reservation
router.put('/:reservationId/cancel', (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    db.run(`
        UPDATE reservations 
        SET status = 'cancelled'
        WHERE id = ? AND status IN ('pending', 'confirmed')
    `, [reservationId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found or cannot be cancelled' });
        }

        res.json({ message: 'Reservation cancelled successfully' });
    });
});

// Auto-expire pending reservations (called by cron job)
router.post('/expire-pending', (req, res) => {
    const db = req.db;

    db.run(`
        UPDATE reservations 
        SET status = 'expired'
        WHERE status = 'pending' 
        AND payment_deadline < CURRENT_TIMESTAMP
    `, function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({ 
            message: `${this.changes} reservations expired`,
            expired_count: this.changes 
        });
    });
});

module.exports = router;
