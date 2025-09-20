# Sistema de Reservas de Autobuses

Una aplicación web completa para la reserva de asientos y autobuses completos para empresas de transporte.

## Características

- **Búsqueda de rutas**: Encuentra viajes disponibles entre ciudades.
- **Selección de fechas**: Ve disponibilidad por fechas específicas.
- **Reserva flexible**: Reserva asientos individuales o autobuses completos.
- **Gestión de horarios**: Múltiples horarios disponibles por ruta.
- **Sistema de precios**: Cálculo automático según tipo de reserva.
- **Timer de pago**: Un tiempo límite para confirmar el pago (configurable).
- **Panel administrativo**: Gestión de flotas, rutas, horarios y reservaciones.

## Tecnologías

- **Backend**: Node.js, Express
- **Base de datos**: PostgreSQL
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Gestión de sesiones**: express-session con connect-pg-simple

## Instalación

1.  **Clonar el repositorio**

2.  **Configurar las variables de entorno**
    Copia el archivo `.env.example` y renómbralo a `.env`. Luego, rellena las variables con tus propios valores.

    ```bash
    cp .env.example .env
    ```

    El archivo `.env` requiere las siguientes variables:

    - `DATABASE_URL`: La URL de conexión a tu base de datos PostgreSQL.
    - `PORT`: El puerto en el que se ejecutará el servidor (por defecto `3000`).
    - `SESSION_SECRET`: Una cadena larga y aleatoria para proteger las sesiones de usuario.
    - `ADMIN_PASSWORD`: La contraseña para acceder al panel de administración.

3.  **Instalar dependencias**

    ```bash
    npm install
    ```

4.  **Iniciar el servidor en modo de desarrollo**

    ```bash
    npm run dev
    ```

## Estructura del proyecto

```
├── server.js              # Servidor principal y punto de entrada
├── database/
│   ├── init.js            # Script de inicialización de la base de datos
│   └── db.js              # Configuración y exportación del pool de PostgreSQL
├── routes/
│   ├── admin.js           # Rutas para el panel de administración
│   ├── buses.js           # Rutas para la gestión de autobuses y horarios
│   ├── reservations.js    # Rutas para crear y gestionar reservaciones
│   └── routes.js          # Rutas para la gestión de rutas (origen/destino)
├── public/                  # Archivos estáticos (HTML, CSS, JS del cliente)
│   ├── index.html         # Página principal para clientes
│   ├── admin.html         # Panel de administración
│   ├── css/               # Estilos CSS
│   └── js/                # Lógica del lado del cliente
├── .env                   # Variables de entorno (ignorado por Git)
├── package.json           # Dependencias y scripts del proyecto
└── README.md              # Este archivo
```

## Uso

1.  El cliente selecciona origen, destino y fecha de viaje.
2.  El sistema muestra los horarios y la disponibilidad.
3.  El cliente elige asientos o la opción de autobús completo.
4.  Se completa un formulario con datos de contacto.
5.  La reserva se crea en estado "pendiente" y se muestra un resumen con el total a pagar y un tiempo límite.
6.  El administrador puede ver y gestionar todas las reservaciones desde el panel de administración.
