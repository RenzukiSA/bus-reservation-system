const express = require('express');
const router = express.Router();
const { v4: uuidv4, validate: uuidValidate } = require('uuid');
const pool = require('../database/db');

// Middleware para validar que el ID de la reserva es un UUID válido
const validateReservationId = (req, res, next) => {
    const { reservationId } = req.params;
    if (!uuidValidate(reservationId)) {
        return res.status(400).json({ error: 'El formato del ID de la reserva no es válido.' });
    }
    next();
};

// Create a new reservation from a hold
router.post('/', async (req, res) => {
    const {
        hold_id,
        customer_name,
        customer_phone,
        customer_email
    } = req.body;

    if (!hold_id || !customer_name || !customer_phone) {
        return res.status(400).json({ error: 'Faltan campos requeridos: hold_id, nombre y teléfono.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Validar el hold y obtener sus datos
        const holdQuery = 'SELECT * FROM holds WHERE id = $1 AND expires_at > NOW() FOR UPDATE';
        const holdResult = await client.query(holdQuery, [hold_id]);

        if (holdResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'El bloqueo de asientos no es válido o ha expirado.' });
        }
        const hold = holdResult.rows[0];
        const { schedule_id, reservation_date, seats_held: selected_seats } = hold;

        // 2. Get schedule info (ya que no viene en el request)
        const scheduleQuery = `
            SELECT s.*, r.base_price, s.price_multiplier, b.capacity 
            FROM schedules s
            JOIN routes r ON s.route_id = r.id
            JOIN buses b ON s.bus_id = b.id
            WHERE s.id = $1
        `;
        const scheduleResult = await client.query(scheduleQuery, [schedule_id]);
        const scheduleInfo = scheduleResult.rows[0];

        // 3. Calcular el precio total (la lógica de tipo de reserva se simplifica)
        const placeholders = selected_seats.map((_, i) => `$${i + 1}`).join(',');
        const seatsQuery = `SELECT price_modifier FROM seats WHERE id IN (${placeholders})`;
        const seatsResult = await client.query(seatsQuery, selected_seats);
        
        const totalPrice = seatsResult.rows.reduce((sum, seat) => {
            return sum + (scheduleInfo.base_price * scheduleInfo.price_multiplier * seat.price_modifier);
        }, 0);

        // 4. Crear la reserva
        const timeoutMinutes = process.env.RESERVATION_TIMEOUT_MINUTES || 15;
        const paymentDeadline = new Date(Date.now() + timeoutMinutes * 60000);
        const seatsReservedJson = JSON.stringify(selected_seats);

        const insertQuery = `
            INSERT INTO reservations (
                schedule_id, reservation_date, reservation_type, seats_reserved, 
                customer_name, customer_phone, customer_email, total_price, payment_deadline, status
            ) VALUES ($1, $2, 'seats', $3, $4, $5, $6, $7, $8, 'pending')
            RETURNING id
        `;
        const insertParams = [
            schedule_id, reservation_date, seatsReservedJson,
            customer_name, customer_phone, customer_email, totalPrice.toFixed(2), paymentDeadline.toISOString()
        ];
        
        const reservationResult = await client.query(insertQuery, insertParams);
        const reservationId = reservationResult.rows[0].id;

        // 5. Eliminar el hold
        await client.query('DELETE FROM holds WHERE id = $1', [hold_id]);

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            reservation_id: reservationId,
            total_price: totalPrice.toFixed(2),
            payment_deadline: paymentDeadline.toISOString(),
            whatsapp_number: process.env.WHATSAPP_BUSINESS_NUMBER
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear la reservación desde el bloqueo:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    } finally {
        client.release();
    }
});

// Get public reservation details by public ID (UUID)
router.get('/:reservationId', validateReservationId, async (req, res) => {
    const { reservationId } = req.params;

    try {
        const query = `
            SELECT 
                res.id, -- public_id
                res.reservation_date,
                res.reservation_type,
                res.total_price,
                res.status,
                res.payment_deadline,
                s.departure_time,
                s.arrival_time,
                r.origin,
                r.destination,
                b.bus_number,
                b.type as bus_type,
                res.seats_reserved
            FROM reservations res
            JOIN schedules s ON res.schedule_id = s.id
            JOIN routes r ON s.route_id = r.id
            JOIN buses b ON s.bus_id = b.id
            WHERE res.id = $1
        `;
        const result = await pool.query(query, [reservationId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Reservación no encontrada' });
        }

        const reservation = result.rows[0];

        // Si es una reserva de asientos, obtener los números de asiento
        if (reservation.reservation_type === 'seats' && reservation.seats_reserved) {
            try {
                const seatIds = reservation.seats_reserved; // Ya es un array de IDs
                const placeholders = seatIds.map((_, i) => `$${i + 1}`).join(',');
                const seatsQuery = `SELECT seat_number FROM seats WHERE id IN (${placeholders})`;
                const seatsResult = await pool.query(seatsQuery, seatIds);
                
                // Añadir los números de asiento a la respuesta pública
                reservation.seats = seatsResult.rows.map(s => s.seat_number);
            } catch (e) {
                // Si falla el parseo de asientos, no es crítico. Continuar sin ellos.
                console.error('Error al procesar asientos para reserva pública:', e);
                reservation.seats = [];
            }
        }

        // Eliminar el campo interno seats_reserved antes de enviar la respuesta
        delete reservation.seats_reserved;

        res.json(reservation);

    } catch (err) {
        console.error('Error al obtener la reservación:', err);
        res.status(500).json({ error: 'Error interno del servidor al procesar la reservación.' });
    }
});

// Confirm payment (admin endpoint)
router.put('/:reservationId/confirm', validateReservationId, async (req, res) => {
    const { reservationId } = req.params;

    try {
        const query = `
            UPDATE reservations 
            SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status = 'pending'
        `;
        const result = await pool.query(query, [reservationId]);

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
router.put('/:reservationId/cancel', validateReservationId, async (req, res) => {
    const { reservationId } = req.params;

    try {
        const query = `
            UPDATE reservations 
            SET status = 'cancelled'
            WHERE id = $1 AND status IN ('pending', 'confirmed')
        `;
        const result = await pool.query(query, [reservationId]);

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
    try {
        const query = `
            UPDATE reservations 
            SET status = 'expired'
            WHERE status = 'pending' 
            AND payment_deadline < CURRENT_TIMESTAMP
        `;
        const result = await pool.query(query);

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
