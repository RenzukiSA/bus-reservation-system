const { Pool } = require('pg');

async function initDatabase(pool) {
    console.log('Conectando a la base de datos PostgreSQL...');
    const client = await pool.connect();
    console.log('Conexión exitosa. Creando tablas si no existen...');

    try {
        // Habilitar la extensión para generar UUIDs
        await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

        // --- INICIO DE CÓDIGO AÑADIDO ---
        // Tabla para sesiones de usuario (connect-pg-simple)
        await client.query(`
            CREATE TABLE IF NOT EXISTS "user_sessions" (
                "sid" varchar NOT NULL COLLATE "default",
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL
            )
            WITH (OIDS=FALSE);
        `);
        // Asegurarse de que la clave primaria exista
        const pkeyCheck = await client.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'user_sessions' AND constraint_type = 'PRIMARY KEY';
        `);
        if (pkeyCheck.rowCount === 0) {
            await client.query(`
                ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
            `);
        }
        // --- FIN DE CÓDIGO AÑADIDO ---

        // Crear tabla de buses
        await client.query(`
            CREATE TABLE IF NOT EXISTS buses (
                id SERIAL PRIMARY KEY,
                bus_number VARCHAR(20) UNIQUE NOT NULL,
                type VARCHAR(50) NOT NULL,
                capacity INT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active' -- active, inactive, maintenance
            );
        `);

        // Crear tabla de asientos
        await client.query(`
            CREATE TABLE IF NOT EXISTS seats (
                id SERIAL PRIMARY KEY,
                bus_id INT REFERENCES buses(id) ON DELETE CASCADE,
                seat_number VARCHAR(10) NOT NULL,
                seat_type VARCHAR(20) NOT NULL, -- standard, premium
                price_modifier NUMERIC(4, 2) DEFAULT 1.0,
                UNIQUE(bus_id, seat_number)
            );
        `);

        // Crear tabla de rutas
        await client.query(`
            CREATE TABLE IF NOT EXISTS routes (
                id SERIAL PRIMARY KEY,
                origin VARCHAR(100) NOT NULL,
                destination VARCHAR(100) NOT NULL,
                distance_km INT,
                base_price NUMERIC(10, 2) NOT NULL,
                UNIQUE(origin, destination)
            );
        `);

        // Crear tabla de horarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                route_id INT REFERENCES routes(id) ON DELETE RESTRICT,
                bus_id INT REFERENCES buses(id) ON DELETE RESTRICT,
                departure_time TIME NOT NULL,
                arrival_time TIME NOT NULL,
                days_of_week JSONB NOT NULL, -- ['monday', 'tuesday', ... 'daily']
                price_multiplier NUMERIC(4, 2) DEFAULT 1.0,
                status VARCHAR(20) NOT NULL DEFAULT 'active' -- active, cancelled, finished
            );
        `);

        // Crear tabla de reservaciones
        await client.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id INT REFERENCES schedules(id) ON DELETE RESTRICT,
                customer_name VARCHAR(150) NOT NULL,
                customer_phone VARCHAR(30) NOT NULL,
                customer_email VARCHAR(100),
                reservation_date DATE NOT NULL,
                reservation_type VARCHAR(20) NOT NULL, -- seats, full_bus
                seats_reserved JSONB, -- Array de IDs de asientos
                total_price NUMERIC(10, 2) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, confirmed, cancelled, expired
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                payment_deadline TIMESTAMPTZ,
                confirmed_at TIMESTAMPTZ
            );
        `);

        // Crear tabla de bloqueos temporales (holds)
        await client.query(`
            CREATE TABLE IF NOT EXISTS holds (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id INT NOT NULL,
                reservation_date DATE NOT NULL,
                seats_held JSONB NOT NULL, -- Array de IDs de asientos
                expires_at TIMESTAMPTZ NOT NULL
            );
        `);

        // --- ÍNDICES PARA MEJORAR EL RENDIMIENTO ---
        await client.query('CREATE INDEX IF NOT EXISTS idx_schedules_route_id ON schedules(route_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_schedules_bus_id ON schedules(bus_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reservations_schedule_id_date ON reservations(schedule_id, reservation_date);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_seats_bus_id ON seats(bus_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_routes_origin_destination ON routes(origin, destination);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_holds_expires_at ON holds(expires_at);');

        console.log('Tablas e índices creados o ya existentes.');
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
            { number: 'E-101', type: 'ejecutivo', capacity: 36, status: 'active' },
            { number: 'P-202', type: 'primera_clase', capacity: 40, status: 'active' },
            { number: 'C-303', type: 'economico', capacity: 44, status: 'inactive' }
        ];

        for (const bus of buses) {
            const busRes = await client.query(
                'INSERT INTO buses (bus_number, type, capacity, status) VALUES ($1, $2, $3, $4) RETURNING id',
                [bus.number, bus.type, bus.capacity, bus.status]
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
            ('Morelia', 'Querétaro', 150, 280.00),
            ('Querétaro', 'Morelia', 150, 280.00),
            ('Zitácuaro', 'Morelia', 100, 180.00),
            ('Morelia', 'Zitácuaro', 100, 180.00);
        `);

        // Insertar horarios
        await client.query(`
            INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier, status) VALUES
            (1, 1, '09:00:00', '12:00:00', '["daily"]', 1.1, 'active'),
            (1, 2, '15:00:00', '18:30:00', '["monday", "wednesday", "friday"]', 1.0, 'active'),
            (2, 1, '10:00:00', '13:00:00', '["daily"]', 1.1, 'active'),
            (3, 2, '08:00:00', '10:00:00', '["saturday", "sunday"]', 1.05, 'active');
        `);

        console.log('Datos de ejemplo insertados correctamente.');
    } catch (err) {
        console.error('Error al insertar datos de ejemplo:', err.stack);
    }
}

module.exports = { initDatabase };
