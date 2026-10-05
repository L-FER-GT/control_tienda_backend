# Despliegue

No hay servidor Node en producción: scripts/ contiene herramientas locales y el runtime es PostgreSQL/Auth/Storage de Supabase.

Las migraciones se despliegan con la integración GitHub de Supabase (Project Settings / Integrations / GitHub): repositorio control_tienda_backend, Working directory `.`, rama de producción develop. Al llegar un commit a develop, Supabase aplica las versiones nuevas de supabase/migrations y las registra en supabase_migrations.schema_migrations. No cambia Auth ni API, no ejecuta seeds, no crea cuentas ni publica Android. El resultado aparece en el commit de GitHub y en el panel de Supabase.

Es el único método de migración: no ejecutar los SQL en SQL Editor ni con otra herramienta contra producción, porque la integración no lo registraría y volvería a aplicarlos.

CI ejecuta npm ci, npm run migrations:check, npm test y npm run build sin secretos. migrations:check exige el formato AAAAMMDDHHMMSS_nombre.sql y rechaza editar o borrar una migración ya presente en la rama base, o agregar una con versión anterior a la última: la integración ignoraría lo primero y fallaría con lo segundo. Supabase despliega sin esperar a CI, por lo que conviene trabajar en ramas feature/ y fusionar en develop mediante pull request con CI en verde (Settings / Branches en GitHub puede exigirlo).

El workflow Storage maintenance usa SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para vaciar la cola de objetos reemplazados. Configurarlo solo al tener el proyecto listo. Los fallos no eliminan la cola y permiten reintentar.
