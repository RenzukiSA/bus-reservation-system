"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateReservationSchema = exports.ContactInfoSchema = exports.TripQuerySchema = void 0;
const zod_1 = require("zod");
// Ya no necesitamos un mapa de errores personalizado, los mensajes van directo en el esquema.
// Esquema para validar los parámetros de búsqueda de un viaje
exports.TripQuerySchema = zod_1.z.object({
    origin: zod_1.z.string().min(1, { message: 'El origen es requerido.' }),
    destination: zod_1.z.string().min(1, { message: 'El destino es requerido.' }),
    date: zod_1.z.string().refine((date) => !isNaN(Date.parse(date)), { message: 'El formato de la fecha no es válido.' }),
});
// Esquema reutilizable para la información de contacto
exports.ContactInfoSchema = zod_1.z.object({
    customer_name: zod_1.z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
    customer_phone: zod_1.z.string().regex(/^[0-9\s\-()+]+$/, { message: 'El formato del teléfono no es válido.' }),
    customer_email: zod_1.z.string().email({ message: 'El formato del email no es válido.' }).optional().or(zod_1.z.literal('')),
});
// Esquema para validar la creación de una reserva
exports.CreateReservationSchema = zod_1.z.object({
    hold_id: zod_1.z.string().uuid({ message: 'El ID del bloqueo no es válido.' }),
}).merge(exports.ContactInfoSchema); // Combinamos con la información de contacto
