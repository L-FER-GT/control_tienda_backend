# Crear y conectar Supabase Free

1. En https://supabase.com/dashboard crear una organización y un proyecto Free. Guardar la contraseña de PostgreSQL. No se necesita contratar Pro.
2. En Connect / API Keys copiar la URL y la clave pública anon o publishable al .env. Copiar la clave secreta/service_role solo al backend. No compartirla en chats ni Android.
3. En Connect copiar la URI PostgreSQL directa o Session Pooler (puerto 5432), sustituyendo la contraseña con su codificación URL cuando corresponda. Colocarla en SUPABASE_DB_URL. Conservar SSL; no desactivar validación de certificados.
4. npm ci; npm run config:check; npm run db:migrate. Alternativamente, ejecutar los SQL de supabase/migrations en orden en SQL Editor, una sola vez. Elegir un método y mantenerlo: el script registra hashes en private.schema_migrations; el editor no.
5. En Authentication / Providers habilitar Email. Para una demo cerrada sin SMTP, desactivar Confirm email y crear cuentas por correo/contraseña. Esto no verifica la propiedad del correo. Para confirmaciones y recuperación de contraseñas reales, configurar SMTP externo en Auth; el emisor predeterminado solo sirve para el equipo del proyecto.
6. En Authentication / URL Configuration añadir controltienda://auth/callback a Redirect URLs. La app recibe allí el enlace de recuperación y permite cambiar la contraseña. Mantener la plantilla predeterminada de recuperación con ConfirmationURL.
7. Completar SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD (al menos 12 caracteres), SUPERADMIN_NAME y ejecutar npm run superadmin:seed.
8. Opcional: habilitar Google en Supabase, configurar sus clientes OAuth web/Android y firmas SHA en Google Cloud, y establecer GOOGLE_WEB_CLIENT_ID. El acceso por correo no depende de Google. El ID token se intercambia directamente con Supabase.
9. Ejecutar npm run test:live y compilar la app. Crear tienda, invitar trabajador/cliente y comprobar una venta desde dos celulares.

Las migraciones crean el bucket privado media, de máximo 5 MiB por archivo, y sus políticas. No hacerlo público. public.documents tiene RLS; private no debe agregarse a los esquemas expuestos en API.

El archivo supabase/config.toml configura únicamente el entorno local de Supabase CLI. Los cambios de Auth en el proyecto alojado se hacen en el panel y no se aplican con npm run db:migrate.

Referencia: https://supabase.com/docs/guides/auth/auth-smtp y https://supabase.com/docs/guides/auth/native-mobile-deep-linking
