"use strict";
const rateLimit = require('express-rate-limit');
// Rate limiter para proteger contra ataques de fuerza bruta en endpoints sensibles
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limitar cada IP a 100 peticiones por ventana de tiempo
    standardHeaders: true, // Devolver información del límite en las cabeceras `RateLimit-*`
    legacyHeaders: false, // Deshabilitar las cabeceras `X-RateLimit-*`
    message: { error: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo en 15 minutos.' }
});
module.exports = apiLimiter;
