# Modelo de datos

public.documents tiene path (clave primaria), data JSONB y updated_at. Los índices cubren el padre del documento y búsquedas JSONB.

Rutas: users/{uid}, publicProfiles/{uid}, userCodes/{code}, users/{uid}/notifications/{id}, stores/{id}, stores/{id}/members/{uid}, invitations/{id}, categories/{id}, products/{id}, products/{id}/priceHistory/{id}, orders/{id}, suppliers/{id}, receptions/{id}, meta/counters.

Las subcolecciones indicadas pertenecen a stores/{id}. Fechas en data son milisegundos UTC. Los importes son enteros en céntimos; cantidades admiten decimales. stock=null significa ilimitado. Un stock negativo es válido para ventas offline. El servidor reemplaza {"$serverTime":true} en campos superiores con su fecha actual.

private.receipts: lotes aplicados por UID e ID de operación; garantiza reintentos idempotentes. private.file_cleanup: archivos reemplazados pendientes de borrado mediante Storage API. private.schema_migrations: control del script de despliegue.

No se envían contraseñas ni claves privilegiadas como documentos. Auth administra identidades UUID. Los códigos públicos de usuario tienen diez dígitos.
