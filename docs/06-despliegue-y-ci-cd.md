# Despliegue

No hay servidor Node en producción: scripts/ contiene herramientas locales y el runtime es PostgreSQL/Auth/Storage de Supabase.

CI ejecuta npm ci, npm test y npm run build sin secretos. El workflow Deploy Supabase se ejecuta manualmente con SUPABASE_DB_URL en un environment. Solo aplica migraciones: no cambia Auth, no recrea cuentas ni publica Android.

El workflow Storage maintenance usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para vaciar la cola de objetos reemplazados. Configurarlo solo al tener el proyecto listo. Los fallos no eliminan la cola y permiten reintentar.
