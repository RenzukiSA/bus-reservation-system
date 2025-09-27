// Solo para desarrollo local, para que nodemon pueda ejecutar archivos .ts
// Esta línea permite a ts-node registrar el compilador de TypeScript para que pueda ejecutar archivos .ts
if (process.env.NODE_ENV !== 'production') {
    require('ts-node').register();
}

// Importaciones necesarias para autenticación
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');

// Importamos la aplicación y la configuración de la base de datos
const app = require('./app');
const pool = require('./database/db');
const { initDatabase } = require('./database/init');

const IS_PROD = process.env.NODE_ENV === 'production';

// Configurar sesiones
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'user_sessions'
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: IS_PROD,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// GET /login - Servir página de login
app.get('/login', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/login.html'));
});

// POST /login - Validar credenciales y crear sesión
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    try {
        // Buscar al usuario por su email en la base de datos
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rowCount === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const user = userResult.rows[0];

        // Comparar la contraseña proporcionada con la contraseña hasheada en la BD
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // Si las credenciales son correctas, crear la sesión del usuario
        req.session.user = {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        };

        // Redirigir a la página principal
        res.json({ success: true, redirect: '/' });

    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Middleware requireAdmin
const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Acceso denegado. Se requieren privilegios de administrador.');
};

// Aplicar middleware de admin SOLO a rutas específicas
app.use('/admin', requireAdmin);
app.use('/api/admin', requireAdmin);

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