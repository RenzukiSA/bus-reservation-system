# Política de Seguridad

Este documento describe cómo reportar vulnerabilidades y la respuesta a incidentes de seguridad.

## Incidente de Seguridad Reciente: Exposición de Variables de Entorno

**Fecha del Incidente:** 2025-09-20

**Resumen:** Se descubrió que el archivo `.env`, que contiene credenciales de la base de datos, secretos de sesión y otras claves sensibles, fue versionado accidentalmente en el historial de Git. Aunque el archivo ya estaba en `.gitignore`, fue añadido en un commit anterior, exponiendo potencialmente esta información a cualquiera con acceso al repositorio.

### Pasos de Mitigación Inmediatos

1.  **Rotación de Credenciales:** Todas las credenciales expuestas en el archivo `.env` deben ser rotadas inmediatamente. Esto incluye:
    *   **`DATABASE_URL`**: Cambiar la contraseña del usuario de la base de datos.
    *   **`SESSION_SECRET`**: Generar un nuevo secreto para invalidar todas las sesiones de usuario activas.
    *   **`ADMIN_PASSWORD`**: Cambiar la contraseña del administrador.

2.  **Eliminación del Historial de Git:** El archivo `.env` debe ser eliminado del historial del repositorio. Esto se ha realizado ejecutando `git rm --cached .env` y se ha confirmado que `.env` está correctamente listado en `.gitignore` para prevenir futuras subidas.

3.  **Auditoría de Acceso:** Se recomienda revisar los registros de acceso a la base de datos y al panel de administración en busca de cualquier actividad sospechosa desde que las credenciales fueron expuestas.

## Reportar una Vulnerabilidad

Si descubres una vulnerabilidad de seguridad, por favor repórtala de forma privada. No divulgues la vulnerabilidad públicamente hasta que haya sido corregida.
