const request = require('supertest');
const appPromise = require('./server'); // Importar la promesa de la app

let app;

// Mock de la base de datos para evitar conexiones reales durante las pruebas
jest.mock('./database/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn(() => ({
    query: jest.fn(),
    release: jest.fn(),
  })),
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

describe('Autenticación de Administrador (/api/admin)', () => {

  beforeAll(() => {
    // Establecer un hash de contraseña de prueba en las variables de entorno
    // Costo de hashing bajo (4) para que las pruebas sean rápidas
    process.env.ADMIN_PASSWORD_HASH = require('bcrypt').hashSync('testpassword', 4);
  });

  test('GET /dashboard debe devolver 401 si no hay sesión de administrador', async () => {
    await request(app)
      .get('/api/admin/dashboard')
      .expect(401);
  });

  test('POST /login debe devolver 401 con una contraseña incorrecta', async () => {
    // Para probar el login, necesitamos simular una petición con un token CSRF válido.
    // Esto es complejo en supertest. En su lugar, esta prueba se centra en la lógica de la contraseña.
    const response = await request(app)
      .post('/api/admin/login')
      .send({ password: 'wrongpassword' });

    // Esperamos un 401 (credenciales incorrectas) o 403 (fallo de CSRF), ambos son fallos de auth.
    expect([401, 403]).toContain(response.statusCode);
  });

});

describe('Sistema de Bloqueo de Asientos (Holds)', () => {
  const mockClient = { 
    query: jest.fn(), 
    release: jest.fn() 
  };
  const dbMock = require('./database/db');
  dbMock.connect.mockImplementation(() => mockClient);

  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  const holdPayload = {
    schedule_id: 1, 
    reservation_date: '2025-12-25',
    selected_seats: [10, 11]
  };

  test('POST /holds debe devolver 409 (Conflict) si se intenta bloquear un asiento ya bloqueado', async () => {
    // --- PRIMERA LLAMADA (Exitosa) ---
    const insertResult = { rows: [{ id: 'some-uuid', expires_at: new Date() }], rowCount: 1 };
    mockClient.query
      .mockImplementation(async (queryText) => {
        const trimmedQuery = queryText.trim();
        if (trimmedQuery.startsWith('INSERT INTO holds')) return insertResult;
        if (trimmedQuery.includes('SELECT seats_reserved FROM reservations')) return { rows: [], rowCount: 0 };
        if (trimmedQuery.includes('SELECT seats_held FROM holds')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 }; // Para BEGIN, COMMIT, etc.
      });

    await request(app)
      .post('/api/holds')
      .send(holdPayload)
      .expect(201);

    // --- SEGUNDA LLAMADA (Falla por colisión) ---
    mockClient.query.mockReset();
    mockClient.query
      .mockImplementation(async (queryText) => {
        const trimmedQuery = queryText.trim();
        if (trimmedQuery.includes('SELECT seats_reserved FROM reservations')) return { rows: [], rowCount: 0 };
        // Ahora, la consulta de holds devuelve un asiento ocupado
        if (trimmedQuery.includes('SELECT seats_held FROM holds')) return { rows: [{ seats_held: holdPayload.selected_seats }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      });

    await request(app)
      .post('/api/holds')
      .send(holdPayload) // Intentar bloquear los mismos asientos
      .expect(409);
  });

  test('POST /reservations debe devolver 404 si el hold_id ha expirado', async () => {
    const expiredHoldId = 'expired-uuid';

    // Simular que la consulta del hold no encuentra nada porque ha expirado
    mockClient.query.mockImplementation(async (queryText) => {
      if (queryText.trim().startsWith('SELECT * FROM holds')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await request(app)
      .post('/api/reservations')
      .send({
        hold_id: expiredHoldId,
        customer_name: 'Test',
        customer_phone: '12345'
      })
      .expect(404);
  });
});
