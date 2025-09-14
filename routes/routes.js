const express = require('express');
const router = express.Router();

// Middleware para verificar si el usuario es administrador
const checkAdmin = (req, res, next) => {
    if (req.session.isAdmin) {
        next();
    } else {
        res.status(401).json({ error: 'Acceso no autorizado.' });
    }
};

// --- ENDPOINTS PÚBLICOS ---

// Obtener todas las rutas de origen y destino para los selectores
router.get('/locations', async (req, res) => {
    try {
        const result = await req.db.query('SELECT DISTINCT origin, destination FROM routes ORDER BY origin, destination');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener las rutas:', err.message);
        res.status(500).json({ error: 'Error al obtener las rutas' });
    }
});


// --- ENDPOINTS DE ADMINISTRACIÓN ---

// Obtener todas las rutas (para la tabla de admin)
router.get('/', checkAdmin, async (req, res) => {
    try {
        const result = await req.db.query('SELECT * FROM routes ORDER BY origin, destination');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener rutas (admin):', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// Crear una nueva ruta
router.post('/', checkAdmin, async (req, res) => {
    const { origin, destination, distance_km, base_price } = req.body;
    
    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    try {
        const existingRoute = await req.db.query(
            'SELECT id FROM routes WHERE LOWER(origin) = LOWER($1) AND LOWER(destination) = LOWER($2)',
            [origin, destination]
        );
        
        if (existingRoute.rows.length > 0) {
            return res.status(400).json({ error: 'Ya existe una ruta con el mismo origen y destino' });
        }
        
        const result = await req.db.query(
            'INSERT INTO routes (origin, destination, distance_km, base_price) VALUES ($1, $2, $3, $4) RETURNING *',
            [origin, destination, distance_km, base_price]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear ruta:', err);
        res.status(500).json({ error: 'Error al crear ruta' });
    }
});

// Actualizar una ruta
router.put('/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    const { origin, destination, distance_km, base_price } = req.body;
    
    if (!origin || !destination || !distance_km || !base_price) {
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    
    try {
        const result = await req.db.query(
            'UPDATE routes SET origin = $1, destination = $2, distance_km = $3, base_price = $4 WHERE id = $5 RETURNING *',
            [origin, destination, distance_km, base_price, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar ruta:', err);
        res.status(500).json({ error: 'Error al actualizar ruta' });
    }
});

// Eliminar una ruta
router.delete('/:id', checkAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
        const schedulesCheck = await req.db.query('SELECT id FROM schedules WHERE route_id = $1', [id]);
        if (schedulesCheck.rows.length > 0) {
            return res.status(400).json({ error: 'No se puede eliminar la ruta porque tiene horarios asociados' });
        }
        
        const result = await req.db.query('DELETE FROM routes WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Ruta no encontrada' });
        }
        
        res.json({ message: 'Ruta eliminada exitosamente' });
    } catch (err) {
        console.error('Error al eliminar ruta:', err);
        res.status(500).json({ error: 'Error al eliminar ruta' });
    }
});

module.exports = router;
