const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'bus_reservations.db');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Checking database contents...\n');

// Check routes
db.all("SELECT COUNT(*) as count FROM routes", (err, rows) => {
    if (err) {
        console.error('Error checking routes:', err);
        return;
    }
    console.log(`📍 Routes in database: ${rows[0].count}`);
    
    if (rows[0].count > 0) {
        db.all("SELECT * FROM routes LIMIT 5", (err, routes) => {
            if (!err) {
                console.log('Sample routes:');
                routes.forEach(route => {
                    console.log(`  - ${route.origin} → ${route.destination} ($${route.base_price})`);
                });
            }
        });
    }
});

// Check buses
db.all("SELECT COUNT(*) as count FROM buses", (err, rows) => {
    if (err) {
        console.error('Error checking buses:', err);
        return;
    }
    console.log(`🚌 Buses in database: ${rows[0].count}`);
    
    if (rows[0].count > 0) {
        db.all("SELECT * FROM buses LIMIT 5", (err, buses) => {
            if (!err) {
                console.log('Sample buses:');
                buses.forEach(bus => {
                    console.log(`  - ${bus.bus_number} (${bus.capacity} seats, ${bus.bus_type})`);
                });
            }
        });
    }
});

// Check schedules
db.all("SELECT COUNT(*) as count FROM schedules", (err, rows) => {
    if (err) {
        console.error('Error checking schedules:', err);
        return;
    }
    console.log(`⏰ Schedules in database: ${rows[0].count}`);
    
    if (rows[0].count > 0) {
        db.all(`
            SELECT s.*, r.origin, r.destination, b.bus_number 
            FROM schedules s 
            JOIN routes r ON s.route_id = r.id 
            JOIN buses b ON s.bus_id = b.id 
            LIMIT 5
        `, (err, schedules) => {
            if (!err) {
                console.log('Sample schedules:');
                schedules.forEach(schedule => {
                    console.log(`  - ${schedule.origin} → ${schedule.destination} at ${schedule.departure_time} (${schedule.bus_number})`);
                    console.log(`    Days: ${schedule.days_of_week}`);
                });
            }
        });
    }
});

// Check seats
db.all("SELECT COUNT(*) as count FROM seats", (err, rows) => {
    if (err) {
        console.error('Error checking seats:', err);
        return;
    }
    console.log(`💺 Seats in database: ${rows[0].count}`);
});

setTimeout(() => {
    db.close();
}, 2000);
