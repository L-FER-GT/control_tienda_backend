# Control Tienda — Supabase Free

Backend para la app Android del repositorio hermano control_tienda_frontend. Dimensionado para el plan Free de Supabase: menos de 100 cuentas y hasta 3 usuarios simultáneos. Solo Supabase: Auth, PostgreSQL y Storage; no requiere VPS, Render, R2 ni Firebase.

## Puesta en marcha

1. Crear un proyecto Free siguiendo [la guía](docs/02-crear-proyecto-supabase.md).
2. Completar .env a partir de [.env.example](.env.example). El .env local ya está preparado; no contiene credenciales ficticias.
3. Ejecutar npm ci y npm run config:check.
4. Enlazar este repositorio en Supabase (Project Settings / Integrations / GitHub, directorio `.`, rama master). master es producción: cada push a master aplica las migraciones nuevas; develop es la rama de integración. Ver [despliegue](docs/06-despliegue-y-ci-cd.md).
5. Ejecutar npm run superadmin:seed.
6. Ejecutar npm run test:live para comprobar el contrato con el proyecto real.
7. Compilar Android. Si ambos repositorios están juntos, Gradle lee las variables públicas de este .env.

## Cambios en la base de datos

Crear un archivo nuevo en supabase/migrations con versión posterior a la última (supabase migration new nombre, o AAAAMMDDHHMMSS_nombre.sql). Nunca editar ni borrar una migración que ya llegó a develop: al pasar a master Supabase la aplica y después ignora cualquier cambio en ella. npm run migrations:check lo valida y CI lo exige.

La migración `20261005000004_member_profile_photos.sql` corrige el rechazo de membresías con foto de perfil: el avatar pertenece a `users/{uid}`, no a la carpeta de la tienda. Permite crear la tienda con un dueño que tiene foto y modificar actividad o permisos de miembros con avatar. Se aplica después de las tres migraciones existentes y no cambia sus datos ni los permisos por rol.

## Validación local

npm test ejecuta las migraciones reales en PostgreSQL WASM (PGlite), con los esquemas de Auth y Storage simulados. Verifica RLS, roles, lotes atómicos, ventas idempotentes, stock, recepciones, invitaciones, bloqueo y eliminación de cuentas. No sustituye una prueba contra Auth/Storage reales.

## Arquitectura y límites

- [Arquitectura y contrato](docs/01-arquitectura.md)
- [Crear proyecto y configurar Auth](docs/02-crear-proyecto-supabase.md)
- [Cuotas y mantenimiento](docs/03-plan-free.md)
- [Administrador](docs/04-superadmin.md)
- [Pruebas y respaldos](docs/05-pruebas-y-respaldos.md)
- [CI y despliegue](docs/06-despliegue-y-ci-cd.md)
- [Credenciales](docs/07-credenciales.md)
- [Modelo de datos](docs/08-modelo-de-datos.md)
- [Seguridad](docs/09-reglas-de-seguridad.md)

La migración del código no transfiere automáticamente usuarios, contraseñas ni datos de un proyecto Firebase existente. La versión de producción parte de un proyecto Supabase nuevo. Los datos remotos anteriores no se modifican; la configuración antigua se conserva únicamente en .env.firebase.backup, ignorado por Git.
