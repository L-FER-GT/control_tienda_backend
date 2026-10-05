# Configuración

SUPABASE_URL: URL del proyecto.
SUPABASE_ANON_KEY: clave pública anon JWT o publishable; se puede incluir en el APK. La seguridad depende de RLS y RPC.
SUPABASE_SERVICE_ROLE_KEY: secreto para scripts administrativos; elude RLS. Nunca en Android.
SUPABASE_STORAGE_BUCKET: media, coincide con las migraciones.
GOOGLE_WEB_CLIENT_ID: opcional para Google OAuth.
SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME: cuenta del administrador.

Las migraciones las aplica la integración GitHub de Supabase, por lo que no se guarda ninguna URI PostgreSQL ni la contraseña de la base de datos en .env ni en GitHub.

.env y .env.firebase.backup están ignorados por Git. La configuración Firebase antigua solo se preserva como respaldo local. No se usa FIREBASE_PROJECT_ID ni GOOGLE_APPLICATION_CREDENTIALS.

Android lee exclusivamente las variables públicas. Prioridad: entorno > propiedad Gradle > local.properties > .env frontend > .env del backend hermano. Después de cambiar una variable pública, recompilar.
