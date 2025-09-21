const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../database/db');

const router = express.Router();

// POST /api/auth/login - Maneja el inicio de sesión
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    try {
        // Buscar al usuario por su email en la base de datos
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        // Si no se encuentra el usuario, enviar un error genérico por seguridad
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

        // Enviar una respuesta exitosa con los datos del usuario (sin la contraseña)
        res.status(200).json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        });

    } catch (error) {
        console.error('Error en el inicio de sesión:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// POST /api/auth/logout - Cierra la sesión del usuario
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
        }
        // Limpiar la cookie de sesión del navegador
        res.clearCookie('connect.sid'); 
        res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
    });
});

// GET /api/auth/status - Verifica si hay una sesión activa
router.get('/status', (req, res) => {
    if (req.session.user) {
        // Si hay un usuario en la sesión, devolver sus datos
        res.status(200).json({ loggedIn: true, user: req.session.user });
    } else {
        // Si no, indicar que no ha iniciado sesión
        res.status(200).json({ loggedIn: false });
    }
});

module.exports = router;
