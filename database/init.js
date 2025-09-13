const bcrypt = require('bcrypt');

async function initDatabase(pool) {
    try {
        console.log('Conectando a la base de datos PostgreSQL...');
        const client = await pool.connect();
        console.log('Conexión exitosa. Creando tablas si no existen...');

        // Tabla de buses
        await client.query(`
            CREATE TABLE IF NOT EXISTS buses (
                id SERIAL PRIMARY KEY,
                bus_number TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL, -- 'ejecutivo', 'primera_clase', 'economico'
                capacity INTEGER NOT NULL
            );
        `);

        // Tabla de rutas
        await client.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                origin TEXT NOT NULL,
                destination TEXT NOT NULL,
                distance_km INTEGER NOT NULL,
                base_price DECIMAL(10, 2) NOT NULL,
                UNIQUE(origin, destination)
            );
        `);

        // Tabla de horarios/viajes
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                route_id INTEGER REFERENCES routes(id),
                bus_id INTEGER REFERENCES buses(id),
                departure_time TIME NOT NULL,
                arrival_time TIME NOT NULL,
                days_of_week TEXT NOT NULL, -- JSON array: ["monday", "tuesday", ...]
                price_multiplier DECIMAL(3, 2) DEFAULT 1.0,
                status TEXT DEFAULT 'active'
            );
        `);

        // Tabla de asientos
        await client.query(`
            CREATE TABLE IF NOT EXISTS seats (
                id SERIAL PRIMARY KEY,
                bus_id INTEGER REFERENCES buses(id),
                seat_number TEXT NOT NULL,
                seat_type TEXT DEFAULT 'standard', -- 'standard', 'premium'
                price_modifier DECIMAL(3, 2) DEFAULT 1.0,
                UNIQUE(bus_id, seat_number)
            );
        `);

        // Tabla de reservas
        await client.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id TEXT PRIMARY KEY, -- UUID
                schedule_id INTEGER REFERENCES schedules(id),
                reservation_date DATE NOT NULL,
                reservation_type TEXT NOT NULL, -- 'seats', 'full_bus'
                seats_reserved TEXT, -- JSON array de seat_ids
                customer_name TEXT NOT NULL,
                customer_phone TEXT NOT NULL,
                customer_email TEXT,
                total_price DECIMAL(10, 2),
                status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'expired'
                payment_deadline TIMESTAMPTZ,
                whatsapp_sent BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                confirmed_at TIMESTAMPTZ
            );
        `);

        console.log('Tablas creadas o ya existentes.');
        await insertSampleData(client);

        client.release();
    } catch (err) {
        console.error('Error al inicializar la base de datos:', err.stack);
        throw err; // Re-throw error to be caught by startServer
    }
}

async function insertSampleData(client) {
    try {
        // Verificar si ya hay datos para no re-insertar
        const res = await client.query('SELECT COUNT(*) FROM buses');
        if (res.rows[0].count > 0) {
            console.log('Los datos de ejemplo ya existen. Omitiendo inserción.');
            return;
        }

        console.log('Insertando datos de ejemplo...');

        // Insertar buses y asientos
        const buses = [
            { number: 'E-101', type: 'ejecutivo', capacity: 36 },
            { number: 'P-202', type: 'primera_clase', capacity: 40 },
            { number: 'C-303', type: 'economico', capacity: 44 }
        ];

        for (const bus of buses) {
            const busRes = await client.query(
                'INSERT INTO buses (bus_number, type, capacity) VALUES ($1, $2, $3) RETURNING id',
                [bus.number, bus.type, bus.capacity]
            );
            const busId = busRes.rows[0].id;

            // Insertar asientos para cada bus
            for (let i = 1; i <= bus.capacity; i++) {
                const isPremium = (bus.type === 'ejecutivo' && i <= 12) || (bus.type === 'primera_clase' && i <= 8);
                const seatType = isPremium ? 'premium' : 'standard';
                const priceModifier = isPremium ? 1.25 : 1.0;
                await client.query(
                    'INSERT INTO seats (bus_id, seat_number, seat_type, price_modifier) VALUES ($1, $2, $3, $4)',
                    [busId, i.toString(), seatType, priceModifier]
                );
            }
        }

        // Insertar rutas
        await client.query(`
            INSERT INTO routes (origin, destination, distance_km, base_price) VALUES
            ('Zitácuaro', 'Morelia', 150, 250.00),
            ('Morelia', 'Querétaro', 200, 350.00),
            ('Zitácuaro', 'Querétaro', 350, 500.00);
        `);

        // Insertar horarios
        await client.query(`
            INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier) VALUES
            (1, 1, '08:00', '10:30', '["monday","wednesday","friday"]', 1.0),
            (1, 2, '14:00', '16:30', '["tuesday","thursday","saturday"]', 1.0),
            (2, 1, '09:00', '12:00', '["daily"]', 1.1),
            (2, 3, '15:00', '18:30', '["daily"]', 0.9),
            (3, 2, '07:00', '12:00', '["saturday","sunday"]', 1.2);
        `);

        console.log('Datos de ejemplo insertados correctamente.');

    } catch (err) {
        console.error('Error al insertar datos de ejemplo:', err.stack);
    }
}

module.exports = { initDatabase };
