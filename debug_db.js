const pool = require('./database/db');

async function checkDatabase() {
    console.log('🔍  Conectando a la base de datos PostgreSQL para depuración...');
    const client = await pool.connect();
    console.log('✅ Conexión exitosa. Verificando contenido de las tablas...\n');

    try {
        const tables = ['routes', 'buses', 'schedules', 'reservations', 'seats'];
        
        for (const table of tables) {
            const res = await client.query(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`- Tabla [${table}]: ${res.rows[0].count} registros.`);
        }

        console.log('\n✅  Verificación completada.');

    } catch (err) {
        console.error('❌ Error durante la verificación de la base de datos:', err);
    } finally {
        await client.release();
        await pool.end();
        console.log('\n🔌 Conexión cerrada.');
    }
}

checkDatabase();
