# Sistema de Reservas de Autobuses

Una aplicación web completa para la reserva de asientos y autobuses completos para empresas de transporte.

## Características

- **Búsqueda de rutas**: Encuentra viajes disponibles entre ciudades (ej: Zitácuaro - Querétaro)
- **Selección de fechas**: Ve disponibilidad por fechas específicas
- **Reserva flexible**: Reserva asientos individuales o autobuses completos
- **Gestión de horarios**: Múltiples horarios disponibles por ruta
- **Sistema de precios**: Cálculo automático según tipo de reserva
- **Timer de pago**: 15 minutos para confirmar pago vía WhatsApp
- **Panel administrativo**: Gestión de flotas, rutas y horarios

## Tecnologías

- **Backend**: Node.js + Express
- **Base de datos**: SQLite
- **Frontend**: HTML5, CSS3, JavaScript vanilla
- **Notificaciones**: Integración con WhatsApp

## Instalación

```bash
npm install
npm run dev
```

## Estructura del proyecto

```
├── server.js              # Servidor principal
├── database/
│   ├── init.js            # Inicialización de BD
│   └── bus_reservations.db # Base de datos SQLite
├── routes/
│   ├── buses.js           # Rutas de autobuses
│   ├── reservations.js    # Rutas de reservas
│   └── admin.js           # Panel administrativo
├── public/
│   ├── index.html         # Página principal
│   ├── css/
│   ├── js/
│   └── assets/
└── config/
    └── database.js        # Configuración de BD
```

## Uso

1. Selecciona origen y destino
2. Elige fecha de viaje
3. Revisa horarios disponibles
4. Selecciona asientos o bus completo
5. Confirma reserva
6. Envía comprobante de pago por WhatsApp en 15 minutos
