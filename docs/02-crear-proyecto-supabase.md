# Crear y conectar Supabase Free

1. En https://supabase.com/dashboard crear una organización y un proyecto Free. Guardar la contraseña de PostgreSQL. No se necesita contratar Pro.
2. En Connect / API Keys copiar la URL y la clave pública anon o publishable al .env. Copiar la clave secreta/service_role solo al backend. No compartirla en chats ni Android.
3. npm ci; npm run config:check.
4. En Project Settings / Integrations / GitHub enlazar L-FER-GT/control_tienda_backend con Working directory `.`, Deploy to production activado y rama master (producción). El siguiente push a master aplica supabase/migrations en orden y las registra en supabase_migrations.schema_migrations. No ejecutar además los SQL en SQL Editor: la integración no lo sabría e intentaría crearlos de nuevo. Comprobar en Table Editor la tabla documents y en Storage el bucket media.
5. En Authentication / Providers habilitar Email y configurar SMTP externo en Auth: las confirmaciones y la recuperación de contraseñas lo necesitan, y el emisor predeterminado solo sirve para el equipo del proyecto. Mientras no haya SMTP, desactivar Confirm email; las cuentas se crean por correo/contraseña sin verificar la propiedad del correo.
6. En Authentication / URL Configuration añadir controltienda://auth/callback a Redirect URLs. La app recibe allí el enlace de recuperación y permite cambiar la contraseña. Mantener la plantilla predeterminada de recuperación con ConfirmationURL.
7. Completar SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (al menos 12 caracteres), SUPERADMIN_NAME y ejecutar npm run superadmin:seed.
8. Opcional: habilitar Google en Supabase, configurar sus clientes OAuth web/Android y firmas SHA en Google Cloud, y establecer GOOGLE_WEB_CLIENT_ID. El acceso por correo no depende de Google. El ID token se intercambia directamente con Supabase.
9. Ejecutar npm run test:live y compilar la app. Crear tienda, invitar trabajador/cliente y comprobar una venta desde dos celulares.

Las migraciones crean el bucket privado media, de máximo 5 MiB por archivo, y sus políticas. No hacerlo público. public.documents tiene RLS; private no debe agregarse a los esquemas expuestos en API.

El archivo supabase/config.toml configura el entorno local de Supabase CLI. La integración GitHub ignora sus secciones [api] y [auth]: los cambios de Auth en el proyecto alojado se hacen en el panel (pasos 5 y 6).

Referencia: https://supabase.com/docs/guides/auth/auth-smtp y https://supabase.com/docs/guides/auth/native-mobile-deep-linking
