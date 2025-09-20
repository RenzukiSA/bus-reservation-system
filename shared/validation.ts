import { z } from 'zod';

// Ya no necesitamos un mapa de errores personalizado, los mensajes van directo en el esquema.

// Esquema para validar los parámetros de búsqueda de un viaje
export const TripQuerySchema = z.object({
  origin: z.string().min(1, { message: 'El origen es requerido.' }),
  destination: z.string().min(1, { message: 'El destino es requerido.' }),
  date: z.string().refine((date) => !isNaN(Date.parse(date)), { message: 'El formato de la fecha no es válido.' }),
});

// Esquema reutilizable para la información de contacto
export const ContactInfoSchema = z.object({
  customer_name: z.string().min(3, { message: 'El nombre debe tener al menos 3 caracteres.' }),
  customer_phone: z.string().regex(/^[0-9\s\-()+]+$/, { message: 'El formato del teléfono no es válido.' }),
  customer_email: z.string().email({ message: 'El formato del email no es válido.' }).optional().or(z.literal('')),
});

// Esquema para validar la creación de una reserva
export const CreateReservationSchema = z.object({
  hold_id: z.string().uuid({ message: 'El ID del bloqueo no es válido.' }),
}).merge(ContactInfoSchema); // Combinamos con la información de contacto

// Tipos inferidos para usar en nuestro código
export type TripQuery = z.infer<typeof TripQuerySchema>;
export type ContactInfo = z.infer<typeof ContactInfoSchema>;
export type CreateReservationPayload = z.infer<typeof CreateReservationSchema>;
