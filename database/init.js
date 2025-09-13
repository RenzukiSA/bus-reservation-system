const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'bus_reservations.db');

function initDatabase() {
    const db = new sqlite3.Database(dbPath);

    db.serialize(() => {
        // Tabla de rutas
        db.run(`CREATE TABLE IF NOT EXISTS routes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            distance_km INTEGER,
            base_price DECIMAL(10,2),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabla de autobuses
        db.run(`CREATE TABLE IF NOT EXISTS buses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bus_number TEXT UNIQUE NOT NULL,
            capacity INTEGER NOT NULL,
            bus_type TEXT NOT NULL, -- 'ejecutivo', 'primera_clase', 'economico'
            status TEXT DEFAULT 'active', -- 'active', 'maintenance', 'inactive'
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tabla de horarios/viajes
        db.run(`CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id INTEGER,
            bus_id INTEGER,
            departure_time TIME NOT NULL,
            arrival_time TIME NOT NULL,
            days_of_week TEXT NOT NULL, -- JSON array: ["monday", "tuesday", ...]
            price_multiplier DECIMAL(3,2) DEFAULT 1.0,
            status TEXT DEFAULT 'active',
            FOREIGN KEY (route_id) REFERENCES routes (id),
            FOREIGN KEY (bus_id) REFERENCES buses (id)
        )`);

        // Tabla de asientos
        db.run(`CREATE TABLE IF NOT EXISTS seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bus_id INTEGER,
            seat_number TEXT NOT NULL,
            seat_type TEXT DEFAULT 'standard', -- 'standard', 'premium', 'vip'
            price_modifier DECIMAL(3,2) DEFAULT 1.0,
            FOREIGN KEY (bus_id) REFERENCES buses (id),
            UNIQUE(bus_id, seat_number)
        )`);

        // Tabla de reservas
        db.run(`CREATE TABLE IF NOT EXISTS reservations (
            id TEXT PRIMARY KEY, -- UUID
            schedule_id INTEGER,
            reservation_date DATE NOT NULL,
            reservation_type TEXT NOT NULL, -- 'seats', 'full_bus'
            seats_reserved TEXT, -- JSON array de seat_ids para reservas individuales
            customer_name TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            customer_email TEXT,
            total_price DECIMAL(10,2),
            status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'expired'
            payment_deadline DATETIME,
            whatsapp_sent BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            confirmed_at DATETIME,
            FOREIGN KEY (schedule_id) REFERENCES schedules (id)
        )`);

        // Insertar datos de ejemplo
        insertSampleData(db);
    });

    return db;
}

function insertSampleData(db) {
    // Rutas de ejemplo
    const routes = [
        ['Zitácuaro', 'Querétaro', 180, 350.00],
        ['Querétaro', 'Zitácuaro', 180, 350.00],
        ['Zitácuaro', 'Ciudad de México', 120, 280.00],
        ['Ciudad de México', 'Zitácuaro', 120, 280.00],
        ['Querétaro', 'Guadalajara', 350, 450.00],
        ['Guadalajara', 'Querétaro', 350, 450.00]
    ];

    db.get("SELECT COUNT(*) as count FROM routes", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO routes (origin, destination, distance_km, base_price) VALUES (?, ?, ?, ?)");
            routes.forEach(route => stmt.run(route));
            stmt.finalize();
        }
    });

    // Autobuses de ejemplo
    const buses = [
        ['BUS001', 40, 'ejecutivo'],
        ['BUS002', 45, 'primera_clase'],
        ['BUS003', 50, 'economico'],
        ['BUS004', 40, 'ejecutivo'],
        ['BUS005', 45, 'primera_clase']
    ];

    db.get("SELECT COUNT(*) as count FROM buses", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO buses (bus_number, capacity, bus_type) VALUES (?, ?, ?)");
            buses.forEach(bus => stmt.run(bus));
            stmt.finalize();

            // Crear asientos para cada autobús
            setTimeout(() => {
                buses.forEach((bus, busIndex) => {
                    const busId = busIndex + 1;
                    const capacity = bus[1];
                    
                    for (let i = 1; i <= capacity; i++) {
                        const seatNumber = i.toString().padStart(2, '0');
                        const seatType = i <= 4 ? 'premium' : 'standard';
                        const priceModifier = seatType === 'premium' ? 1.2 : 1.0;
                        
                        db.run("INSERT INTO seats (bus_id, seat_number, seat_type, price_modifier) VALUES (?, ?, ?, ?)",
                            [busId, seatNumber, seatType, priceModifier]);
                    }
                });
            }, 100);
        }
    });

    // Horarios de ejemplo
    const schedules = [
        // Ruta 1: Zitácuaro -> Querétaro
        [1, 1, '06:00', '09:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        [1, 2, '10:00', '13:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        // Ruta 2: Querétaro -> Zitácuaro
        [2, 3, '07:00', '10:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        [2, 4, '11:00', '14:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        // Ruta 3: Zitácuaro -> Ciudad de México
        [3, 1, '08:00', '10:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        [3, 5, '12:00', '14:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.1],
        // Ruta 4: Ciudad de México -> Zitácuaro
        [4, 2, '09:00', '11:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        [4, 4, '13:00', '15:30', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.0],
        // Ruta 5: Querétaro -> Guadalajara
        [5, 5, '10:00', '15:00', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.2],
        // Ruta 6: Guadalajara -> Querétaro
        [6, 1, '11:00', '16:00', '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]', 1.2]
    ];

    db.get("SELECT COUNT(*) as count FROM schedules", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO schedules (route_id, bus_id, departure_time, arrival_time, days_of_week, price_multiplier) VALUES (?, ?, ?, ?, ?, ?)");
            schedules.forEach(schedule => stmt.run(schedule));
            stmt.finalize();
        }
    });
}

module.exports = { initDatabase };
