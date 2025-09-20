const express = require('express');
const router = express.Router();
const pool = require('../database/db');

const HOLD_DURATION_MINUTES = 15;

// POST /api/holds - Crear un nuevo bloqueo de asientos
router.post('/', async (req, res) => {
    const { schedule_id, reservation_date, selected_seats } = req.body;

    if (!schedule_id || !reservation_date || !Array.isArray(selected_seats) || selected_seats.length === 0) {
        return res.status(400).json({ error: 'Faltan datos requeridos para el bloqueo.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener todos los asientos ya reservados para ese viaje
        const reservedSeatsQuery = `
            SELECT seats_reserved FROM reservations
            WHERE schedule_id = $1 AND reservation_date = $2 AND status IN ('pending', 'confirmed')
        `;
        const reservedSeatsResult = await client.query(reservedSeatsQuery, [schedule_id, reservation_date]);
        const reservedSeatIds = reservedSeatsResult.rows.flatMap(r => r.seats_reserved || []);

        // 2. Obtener todos los asientos ya bloqueados (held)
        const heldSeatsQuery = `
            SELECT seats_held FROM holds
            WHERE schedule_id = $1 AND reservation_date = $2 AND expires_at > NOW()
        `;
        const heldSeatsResult = await client.query(heldSeatsQuery, [schedule_id, reservation_date]);
        const heldSeatIds = heldSeatsResult.rows.flatMap(h => h.seats_held || []);

        // 3. Comprobar si alguno de los asientos solicitados ya está ocupado o bloqueado
        const allTakenSeats = new Set([...reservedSeatIds, ...heldSeatIds]);
        const collision = selected_seats.some(seatId => allTakenSeats.has(seatId));

        if (collision) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Uno o más de los asientos seleccionados ya no están disponibles.' });
        }

        // 4. Si no hay colisión, crear el bloqueo
        const expires_at = new Date(Date.now() + HOLD_DURATION_MINUTES * 60000);
        const insertHoldQuery = `
            INSERT INTO holds (schedule_id, reservation_date, seats_held, expires_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id, expires_at
        `;
        const result = await client.query(insertHoldQuery, [schedule_id, reservation_date, JSON.stringify(selected_seats), expires_at]);

        await client.query('COMMIT');

        res.status(201).json({
            hold_id: result.rows[0].id,
            expires_at: result.rows[0].expires_at
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear el bloqueo:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    } finally {
        client.release();
    }
});

// DELETE /api/holds/:id - Liberar un bloqueo de asientos
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM holds WHERE id = $1', [id]);
        res.status(204).send(); // No content
    } catch (err) {
        console.error('Error al eliminar el bloqueo:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/holds/expire - Job para expirar bloqueos antiguos
router.post('/expire', async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM holds WHERE expires_at <= NOW()');
        console.log(`Job de expiración de holds: ${result.rowCount} bloqueos eliminados.`);
        res.status(200).json({ expired_count: result.rowCount });
    } catch (err) {
        console.error('Error en el job de expiración de holds:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

module.exports = router;
