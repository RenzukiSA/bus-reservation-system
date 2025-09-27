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

// SERVIR ARCHIVOS ESTÁTICOS ANTES DE CUALQUIER MIDDLEWARE DE AUTH
app.use('/public', express.static(path.resolve(__dirname, '../public'), { maxAge: '7d', etag: true }));
app.use('/public', express.static(path.resolve(__dirname, 'public'), { maxAge: '7d', etag: true }));

// RUTAS PÚBLICAS SIEMPRE ACCESIBLES (ANTES DE AUTH)
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../public/login.html'));
});

app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// ENDPOINT DE DIAGNÓSTICO TEMPORAL
app.get('/__assets', (req, res) => res.json({ 
    css: '/public/css/styles.css', 
    js: '/public/js/app.js', 
    ok: true 
}));

// CONFIGURAR SESIONES
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

// POST /login - Validar credenciales y crear sesión (NO PROTEGIDO)
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

// MIDDLEWARE requireAdmin SOLO PARA RUTAS ESPECÍFICAS
const requireAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Acceso denegado. Se requieren privilegios de administrador.');
};

// APLICAR MIDDLEWARE DE ADMIN SOLO A RUTAS ESPECÍFICAS
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
            console.log(`Listening on ${PORT}`);
        });
    })
    .catch(error => {
        // Si ocurre un error fatal al iniciar el servidor, lo registramos y salimos del proceso
        console.error('Error fatal al iniciar el servidor:', error);
        process.exit(1);
    });