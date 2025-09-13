const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'bus_reservations.db');
const db = new sqlite3.Database(dbPath);

// Test the exact query logic from the API
const origin = 'Zitácuaro';
const destination = 'Querétaro';
const date = '2024-09-11'; // Tomorrow

const dateObj = new Date(date);
const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dayOfWeek = dayNames[dateObj.getDay()];

console.log(`🔍 Testing query for: ${origin} → ${destination} on ${date}`);
console.log(`📅 Day of week: ${dayOfWeek} (index: ${dateObj.getDay()})`);
console.log(`🔎 Search pattern: %"${dayOfWeek}"%\n`);

const query = `
    SELECT 
        s.id as schedule_id,
        s.departure_time,
        s.arrival_time,
        s.price_multiplier,
        s.days_of_week,
        r.base_price,
        r.distance_km,
        b.bus_number,
        b.capacity,
        b.bus_type,
        b.id as bus_id
    FROM schedules s
    JOIN routes r ON s.route_id = r.id
    JOIN buses b ON s.bus_id = b.id
    WHERE r.origin = ? AND r.destination = ?
    AND s.status = 'active'
    AND b.status = 'active'
    AND s.days_of_week LIKE ?
    ORDER BY s.departure_time
`;

db.all(query, [origin, destination, `%"${dayOfWeek}"%`], (err, rows) => {
    if (err) {
        console.error('❌ Query error:', err.message);
        return;
    }
    
    console.log(`✅ Query executed successfully. Found ${rows.length} schedules:`);
    
    if (rows.length === 0) {
        console.log('\n🔍 Let\'s check what schedules exist for this route:');
        
        db.all(`
            SELECT s.*, r.origin, r.destination 
            FROM schedules s 
            JOIN routes r ON s.route_id = r.id 
            WHERE r.origin = ? AND r.destination = ?
        `, [origin, destination], (err, allSchedules) => {
            if (!err) {
                console.log(`Found ${allSchedules.length} total schedules for this route:`);
                allSchedules.forEach(schedule => {
                    console.log(`  - ${schedule.departure_time}: days_of_week = ${schedule.days_of_week}`);
                    console.log(`    Pattern match test: "${schedule.days_of_week}".includes("${dayOfWeek}") = ${schedule.days_of_week.includes(dayOfWeek)}`);
                });
            }
        });
    } else {
        rows.forEach(row => {
            console.log(`  - ${row.departure_time} - ${row.arrival_time} (${row.bus_number})`);
            console.log(`    Days: ${row.days_of_week}`);
        });
    }
    
    setTimeout(() => db.close(), 1000);
});
