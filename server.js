// Solo para desarrollo local, para que nodemon pueda ejecutar archivos .ts
if (process.env.NODE_ENV !== 'production') {
    require('ts-node').register();
}

const app = require('./app');
const pool = require('./database/db');
const { initDatabase } = require('./database/init');

const PORT = process.env.PORT || 3000;

// Inicializamos la base de datos y LUEGO iniciamos el servidor.
// El .then() y .catch() asegura que el proceso se maneje correctamente.
initDatabase(pool)
    .then(() => {
        console.log('Base de datos inicializada correctamente.');
        app.listen(PORT, () => {
            console.log(`Servidor escuchando en el puerto ${PORT}`);
        });
    })
    .catch(error => {
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    });
    