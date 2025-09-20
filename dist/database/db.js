"use strict";
const { Pool } = require('pg');
require('dotenv').config();
let pool;
// Si estamos en entorno de pruebas, usamos un mock para no conectar a la DB real.
if (process.env.NODE_ENV === 'test') {
    pool = {
        query: () => Promise.resolve({ rows: [], rowCount: 0 }),
        connect: () => Promise.resolve({
            query: () => Promise.resolve({ rows: [], rowCount: 0 }),
            release: () => { },
        }),
    };
}
else {
    // Configuración para producción y desarrollo
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
}
module.exports = pool;
