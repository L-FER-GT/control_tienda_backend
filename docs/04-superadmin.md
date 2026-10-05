# Administrador del sistema

Completar las variables SUPERADMIN_* y SUPABASE_SERVICE_ROLE_KEY en el .env del backend. Ejecutar npm run superadmin:seed. El script crea o actualiza la cuenta por la API Admin y guarda superadmin=true en app_metadata (no en user_metadata editable por el usuario).

Cerrar e iniciar sesión nuevamente para actualizar los claims de la app. La autorización del servidor consulta la identidad actual; ocultar botones no constituye seguridad.

Puede consultar tamaños de almacenamiento y bloquear usuarios/tiendas. No puede deshabilitar su propia cuenta desde el panel. No introducir la clave privilegiada en el frontend.
