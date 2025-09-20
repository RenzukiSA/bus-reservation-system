const request = require('supertest');
const appPromise = require('./server'); // Importar la promesa de la app

let app;

// Mock de la base de datos para evitar conexiones reales durante las pruebas
jest.mock('./database/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
}));

jest.mock('./database/init', () => ({
  initDatabase: jest.fn().mockResolvedValue(true),
}));

beforeAll(async () => {
  app = await appPromise; // Espera a que la app esté lista
});

describe('Smoke Tests del Servidor', () => {

  // Test 1: Verificar que la ruta raíz responde correctamente
  test('GET / debe responder con el HTML principal', async () => {
    const response = await request(app)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200);

    // Verificar que el HTML contiene el título de la aplicación
    expect(response.text).toContain('<title>Sistema de Reservas de Autobuses</title>');
  });

  // Test 2: Verificar que una ruta de API conocida responde
  test('GET /api/routes/locations debe responder con un código de éxito', async () => {
    // Como no estamos autenticados, esperamos una respuesta, no necesariamente los datos.
    // El mock de la DB se encargará de que no falle por conexión.
    await request(app)
      .get('/api/routes/locations') // Corregido: apuntar al endpoint público
      .expect(200); // Esperamos un 200 OK, ya que esta ruta es pública
  });

  // Test 3: Verificar que una ruta protegida por rate-limit responde
  test('GET /api/reservations/some-id debe responder (probablemente 404 sin sesión)', async () => {
    // El objetivo es solo confirmar que la ruta está registrada y responde, no probar la lógica.
    const response = await request(app).get('/api/reservations/some-id');
    // El código puede variar (404 si no encuentra, 401 si necesita auth), pero no debe ser 500.
    expect(response.statusCode).not.toBe(500);
  });

  // Test 4: Verificar que la cabecera X-Request-Id está presente gracias al logger
  test('Debe incluir la cabecera X-Request-Id en las respuestas', async () => {
    const response = await request(app).get('/');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  // Test 5: Verificar que Helmet está estableciendo cabeceras de seguridad
  test('Debe incluir cabeceras de seguridad de Helmet', async () => {
    const response = await request(app).get('/');
    // x-content-type-options es una cabecera común de Helmet para prevenir sniffing
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

});

describe('Rutas de Reservas (/api/reservations)', () => {
  const validUUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const invalidUUID = '12345';
  const nonExistentUUID = 'a47ac10b-58cc-4372-a567-0e02b2c3d47a';

  // Mock para simular una reserva encontrada
  const mockReservation = {
    id: validUUID,
    reservation_date: '2025-10-10',
    status: 'pending',
    // ... otros campos públicos
  };

  test('GET /:reservationId debe devolver los detalles públicos con un UUID válido', async () => {
    // Simular que la DB encuentra la reserva
    const dbMock = require('./database/db');
    dbMock.query.mockResolvedValueOnce({ rows: [mockReservation], rowCount: 1 });

    const response = await request(app)
      .get(`/api/reservations/${validUUID}`)
      .expect(200)
      .expect('Content-Type', /json/);

    // Verificar que no se exponen campos sensibles
    expect(response.body.customer_phone).toBeUndefined();
    expect(response.body.customer_email).toBeUndefined();
    expect(response.body.id).toBe(validUUID);
  });

  test('GET /:reservationId debe devolver 400 con un formato de ID inválido', async () => {
    await request(app)
      .get(`/api/reservations/${invalidUUID}`)
      .expect(400)
      .expect('Content-Type', /json/);
  });

  test('GET /:reservationId debe devolver 404 si el UUID no se encuentra', async () => {
    // Simular que la DB no encuentra nada
    const dbMock = require('./database/db');
    dbMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await request(app)
      .get(`/api/reservations/${nonExistentUUID}`)
      .expect(404)
      .expect('Content-Type', /json/);
  });
});
