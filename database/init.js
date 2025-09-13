const { Pool } = require('pg');

async function initDatabase(pool) {
    console.log('Conectando a la base de datos PostgreSQL...');
    const client = await pool.connect();
    console.log('Conexión exitosa. Creando tablas si no existen...');

    try {
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
                bus_number VARCHAR(10) UNIQUE NOT NULL,
                type VARCHAR(20) NOT NULL,
                capacity INT NOT NULL
            );
        `);

        // Crear tabla de asientos
        await client.query(`
            CREATE TABLE IF NOT EXISTS seats (
                id SERIAL PRIMARY KEY,
                bus_id INT REFERENCES buses(id),
                seat_number VARCHAR(5) NOT NULL,
                seat_type VARCHAR(20) NOT NULL,
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
                distance_km INT NOT NULL,
                base_price NUMERIC(10, 2) NOT NULL
            );
        `);

        // Crear tabla de horarios
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                route_id INT REFERENCES routes(id),
                bus_id INT REFERENCES buses(id),
                departure_time TIME NOT NULL,
                arrival_time TIME NOT NULL,
                days_of_week TEXT NOT NULL,
                price_multiplier NUMERIC(4, 2) DEFAULT 1.0
            );
        `);

        // Crear tabla de reservaciones
        await client.query(`
            CREATE TABLE IF NOT EXISTS reservations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                schedule_id INT REFERENCES schedules(id),
                customer_name VARCHAR(100) NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                customer_email VARCHAR(100),
                reservation_date DATE NOT NULL,
                reservation_type VARCHAR(20) NOT NULL,
                seats_reserved TEXT,
                total_price NUMERIC(10, 2) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                payment_deadline TIMESTAMPTZ,
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
            ('Morelia', 'Querétaro', 150, 280.00),
            ('Querétaro', 'Morelia', 150, 280.00),
            ('Zitácuaro', 'Morelia', 100, 180.00),
            ('Morelia', 'Zitácuaro', 100, 180.00);
        `);

        // Insertar horarios
        await client.query(`
            INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier) VALUES
            (1, 1, '09:00:00', '12:00:00', '["daily"]', 1.1),
            (1, 3, '15:00:00', '18:30:00', '["monday", "wednesday", "friday"]', 1.0),
            (2, 1, '10:00:00', '13:00:00', '["daily"]', 1.1),
            (3, 2, '08:00:00', '10:00:00', '["saturday", "sunday"]', 1.05);
        `);

        console.log('Datos de ejemplo insertados correctamente.');
    } catch (err) {
        console.error('Error al insertar datos de ejemplo:', err.stack);
    }
}

module.exports = { initDatabase };
