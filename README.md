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
    ```bash
    git clone https://github.com/RenzukiSA/bus-reservation-system.git
    cd bus-reservation-system
    ```

2.  **Configurar variables de entorno**

    El proyecto utiliza variables de entorno para manejar información sensible. Para desarrollo local, sigue estos pasos:

    *   Crea una copia del archivo `.env.example` y renómbrala a `.env`.
        ```bash
        # En Windows (Command Prompt)
        copy .env.example .env
        
        # En Windows (PowerShell)
        Copy-Item .env.example .env
        
        # En Linux/macOS
        cp .env.example .env
        ```
    *   Abre el archivo `.env` y reemplaza los valores de ejemplo con tus propias credenciales (tu URL de base de datos, contraseñas, etc.).

3.  **Instalar dependencias**
    ```bash
    npm install
    ```

4.  **Iniciar el servidor en modo de desarrollo**
    ```bash
    npm run dev
    ```
    El servidor se iniciará en `http://localhost:3000` (o el puerto que hayas definido en tu `.env`).

## Despliegue en Producción (Render)

Para desplegar esta aplicación en un servicio como [Render](https://render.com/), no debes usar un archivo `.env`. En su lugar, debes configurar las variables de entorno directamente en el panel de tu servicio:

1.  Ve a tu servicio en Render.
2.  Navega a la pestaña **"Environment"**.
3.  En la sección **"Environment Variables"**, añade las siguientes claves y sus correspondientes valores de producción:
    *   `DATABASE_URL`
    *   `SESSION_SECRET`
    *   `ADMIN_PASSWORD`
    *   `NODE_ENV` (con el valor `production`)

## Archivos Estáticos

-   **Rutas en el navegador**: Todos los archivos estáticos (CSS, JS del cliente, imágenes) se sirven bajo el prefijo `/public`. Por ejemplo, para acceder al archivo de estilos principal, la URL es `/public/css/styles.css`.
-   **Ubicación de los archivos fuente**: Los archivos que se deben editar están en la carpeta `public/` en la raíz del proyecto.
-   **Nota sobre la compilación**: La configuración de Express (`express.static(path.join(__dirname, 'public'))`) funciona tanto en desarrollo como en producción. En desarrollo, `__dirname` es la raíz del proyecto. En producción, el script `postbuild` copia la carpeta `public` dentro de `dist`, y como el servidor se ejecuta desde `dist`, `__dirname` apunta a `dist`, encontrando la carpeta `public` correctamente en su interior.

## Assets en Producción

-   **Rutas Absolutas**: Todas las referencias a archivos estáticos (CSS, JS, imágenes) en el HTML deben usar rutas absolutas que comiencen con `/public/`. Por ejemplo: `/public/css/styles.css`.

-   **Comportamiento del Servidor**: La aplicación utiliza una estrategia de doble middleware para servir archivos estáticos, lo que garantiza su funcionamiento tanto en desarrollo como en producción. En producción, `__dirname` apunta a la carpeta `dist/`, y el servidor sirve los archivos desde `../public` (la carpeta `public/` en la raíz del proyecto).

-   **Cómo Probar**: Para verificar que las rutas de los assets son correctas, puedes acceder a dos URLs en tu entorno de desarrollo:
    1.  Abre `http://localhost:3000/__assets` en tu navegador. Deberías ver un JSON con las rutas correctas.
    2.  Abre `http://localhost:3000/public/css/styles.css`. Deberías ver el contenido de tu archivo CSS.

## Estructura del proyecto

```
server.js         # Servidor principal y punto de entrada
database/
│   ├── init.js            # Script de inicialización de la base de datos
│   └── db.js              # Configuración y exportación del pool de PostgreSQL
routes/
│   ├── admin.js           # Rutas para el panel de administración
│   ├── buses.js           # Rutas para la gestión de autobuses y horarios
│   ├── reservations.js    # Rutas para crear y gestionar reservaciones
│   └── routes.js          # Rutas para la gestión de rutas (origen/destino)
public/                  # Archivos estáticos (HTML, CSS, JS del cliente)
│   ├── index.html         # Página principal para clientes
│   ├── admin.html         # Panel de administración
│   ├── css/               # Estilos CSS
│   └── js/                # Lógica del lado del cliente
.env                   # Variables de entorno (ignorado por Git)
package.json           # Dependencias y scripts del proyecto
README.md              # Este archivo

## Uso

1.  El cliente selecciona origen, destino y fecha de viaje.
2.  El sistema muestra los horarios y la disponibilidad.
3.  El cliente elige asientos o la opción de autobús completo.
4.  Se completa un formulario con datos de contacto.
5.  La reserva se crea en estado "pendiente" y se muestra un resumen con el total a pagar y un tiempo límite.
6.  El administrador puede ver y gestionar todas las reservaciones desde el panel de administración.
