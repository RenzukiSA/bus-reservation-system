// Solo para desarrollo local, para que nodemon pueda ejecutar archivos .ts
// Esta línea permite a ts-node registrar el compilador de TypeScript para que pueda ejecutar archivos .ts
if (process.env.NODE_ENV !== 'production') {
    require('ts-node').register();
}

// Importamos la aplicación y la configuración de la base de datos
const app = require('./app');
const pool = require('./database/db');
const { initDatabase } = require('./database/init');

// Establecemos el puerto en el que se ejecutará el servidor
const PORT = process.env.PORT || 3000;

// Inicializamos la base de datos y LUEGO iniciamos el servidor.
// El .then() y .catch() asegura que el proceso se maneje correctamente.
// initDatabase devuelve una promesa que se resuelve cuando la base de datos está lista
initDatabase(pool)
    .then(() => {
        // La base de datos se ha inicializado correctamente, ahora podemos iniciar el servidor
        console.log('Base de datos inicializada correctamente.');
        // Iniciamos el servidor y lo configuramos para que escuche en el puerto especificado
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor escuchando en el puerto ${PORT}`);
        });
    })
    .catch(error => {
        // Si ocurre un error fatal al iniciar el servidor, lo registramos y salimos del proceso
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    });