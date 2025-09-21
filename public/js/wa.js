// /public/js/wa.js

/**
 * Construye una URL de WhatsApp para iniciar el proceso de pago.
 * @param {object} options
 * @param {string} options.phone - El número de teléfono de destino (solo dígitos).
 * @param {string} options.reservationId - El ID público de la reserva.
 * @param {number|string} options.total - El monto total a pagar.
 * @param {string} options.origin - La ciudad de origen.
 * @param {string} options.destination - La ciudad de destino.
 * @param {string} options.date - La fecha del viaje.
 * @returns {string} La URL completa de WhatsApp.
 */
function buildWhatsAppUrl({ phone, reservationId, total, origin, destination, date }) {
    const message = `
¡Hola! 👋

Quiero realizar el pago de mi reserva con los siguientes detalles:

*ID de Reserva:* ${reservationId}
*Ruta:* ${origin} → ${destination}
*Fecha:* ${new Date(date).toLocaleDateString('es-ES')}
*Monto a Pagar:* $${total}

Adjunto mi comprobante de pago. ¡Gracias!
    `.trim();

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    
    return url;
}
