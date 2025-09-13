const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// Create a new reservation
router.post('/', async (req, res) => {
    const {
        schedule_id,
        reservation_date,
        reservation_type,
        selected_seats, // array of seat IDs
        customer_name,
        customer_phone,
        customer_email
    } = req.body;

    if (!schedule_id || !reservation_date || !reservation_type || !customer_name || !customer_phone) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const db = req.db; // This is the pg pool

    try {
        // 1. Get schedule info
        const scheduleQuery = `
            SELECT s.*, r.base_price, b.capacity 
            FROM schedules s
            JOIN routes r ON s.route_id = r.id
            JOIN buses b ON s.bus_id = b.id
            WHERE s.id = $1
        `;
        const scheduleResult = await db.query(scheduleQuery, [schedule_id]);
        if (scheduleResult.rows.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }
        const scheduleInfo = scheduleResult.rows[0];

        // 2. Check for existing reservations for this schedule and date
        const existingReservationsQuery = `
            SELECT reservation_type, seats_reserved 
            FROM reservations 
            WHERE schedule_id = $1 AND reservation_date = $2 AND status IN ('pending', 'confirmed')
        `;
        const existingReservationsResult = await db.query(existingReservationsQuery, [schedule_id, reservation_date]);

        let reservedSeatIds = [];
        let isFullBusReserved = false;
        existingReservationsResult.rows.forEach(r => {
            if (r.reservation_type === 'full_bus') {
                isFullBusReserved = true;
            } else {
                const seats = JSON.parse(r.seats_reserved || '[]');
                reservedSeatIds.push(...seats);
            }
        });

        if (isFullBusReserved) {
            return res.status(409).json({ error: 'El autobús completo ya ha sido reservado para esta fecha.' });
        }

        // 3. Calculate total price and validate seats
        let totalPrice = 0;
        if (reservation_type === 'full_bus') {
            if (reservedSeatIds.length > 0) {
                return res.status(409).json({ error: 'No se puede reservar el autobús completo, ya hay asientos individuales reservados.' });
            }
            totalPrice = scheduleInfo.base_price * scheduleInfo.price_multiplier * scheduleInfo.capacity * 0.90; // 10% discount
        } else if (reservation_type === 'seats') {
            if (!selected_seats || selected_seats.length === 0) {
                return res.status(400).json({ error: 'Debe seleccionar al menos un asiento.' });
            }

            const alreadyReserved = selected_seats.some(id => reservedSeatIds.includes(id));
            if (alreadyReserved) {
                return res.status(409).json({ error: 'Uno o más de los asientos seleccionados ya están ocupados.' });
            }

            const placeholders = selected_seats.map((_, i) => `$${i + 1}`).join(',');
            const seatsQuery = `SELECT price_modifier FROM seats WHERE id IN (${placeholders})`;
            const seatsResult = await db.query(seatsQuery, selected_seats);
            
            totalPrice = seatsResult.rows.reduce((sum, seat) => {
                return sum + (scheduleInfo.base_price * scheduleInfo.price_multiplier * seat.price_modifier);
            }, 0);
        } else {
            return res.status(400).json({ error: 'Tipo de reservación no válido.' });
        }

        // 4. Create reservation
        const reservationId = uuidv4();
        const timeoutMinutes = process.env.RESERVATION_TIMEOUT_MINUTES || 15;
        const paymentDeadline = new Date(Date.now() + timeoutMinutes * 60000);
        const seatsReservedJson = reservation_type === 'seats' ? JSON.stringify(selected_seats) : null;

        const insertQuery = `
            INSERT INTO reservations (
                id, schedule_id, reservation_date, reservation_type, seats_reserved, 
                customer_name, customer_phone, customer_email, total_price, payment_deadline, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
        `;
        const insertParams = [
            reservationId, schedule_id, reservation_date, reservation_type, seatsReservedJson,
            customer_name, customer_phone, customer_email, totalPrice.toFixed(2), paymentDeadline.toISOString()
        ];
        
        await db.query(insertQuery, insertParams);

        res.status(201).json({
            success: true,
            reservation_id: reservationId,
            total_price: totalPrice.toFixed(2),
            payment_deadline: paymentDeadline.toISOString(),
            whatsapp_number: process.env.WHATSAPP_BUSINESS_NUMBER
        });

    } catch (err) {
        console.error('Error al crear la reservación:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

// Get reservation details
router.get('/:reservationId', async (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    try {
        const query = `
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
            WHERE res.id = $1
        `;
        const result = await db.query(query, [reservationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada' });
        }

        const reservation = result.rows[0];

        // If it's a seat reservation, get seat details
        if (reservation.reservation_type === 'seats' && reservation.seats_reserved) {
            try {
                const seatIds = JSON.parse(reservation.seats_reserved);
                const placeholders = seatIds.map((_, i) => `$${i + 1}`).join(',');
                const seatsQuery = `SELECT seat_number, seat_type FROM seats WHERE id IN (${placeholders})`;
                const seatsResult = await db.query(seatsQuery, seatIds);

                res.json({
                    ...reservation,
                    seats: seatsResult.rows
                });
            } catch (e) {
                res.json(reservation);
            }
        } else {
            res.json(reservation);
        }
    } catch (err) {
        console.error('Error al obtener la reservación:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

// Confirm payment (admin endpoint)
router.put('/:reservationId/confirm', async (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    try {
        const query = `
            UPDATE reservations 
            SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'pending'
        `;
        const result = await db.query(query, [reservationId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada o ya procesada' });
        }

        res.json({ message: 'Pago confirmado exitosamente' });
    } catch (err) {
        console.error('Error al confirmar el pago:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

// Cancel reservation
router.put('/:reservationId/cancel', async (req, res) => {
    const { reservationId } = req.params;
    const db = req.db;

    try {
        const query = `
            UPDATE reservations 
            SET status = 'cancelled'
            WHERE id = $1 AND status IN ('pending', 'confirmed')
        `;
        const result = await db.query(query, [reservationId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada o no puede ser cancelada' });
        }

        res.json({ message: 'Reservación cancelada exitosamente' });
    } catch (err) {
        console.error('Error al cancelar la reservación:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

// Auto-expire pending reservations (called by cron job)
router.post('/expire-pending', async (req, res) => {
    const db = req.db;

    try {
        const query = `
            UPDATE reservations 
            SET status = 'expired'
            WHERE status = 'pending' 
            AND payment_deadline < CURRENT_TIMESTAMP
        `;
        const result = await db.query(query);

        res.json({ 
            message: `${result.rowCount} reservaciones expiradas`,
            expired_count: result.rowCount 
        });
    } catch (err) {
        console.error('Error al expirar las reservaciones pendientes:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

module.exports = router;
