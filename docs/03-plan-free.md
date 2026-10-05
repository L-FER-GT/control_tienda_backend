# Plan Free y mantenimiento

Referencia consultada: https://supabase.com/pricing (octubre de 2026).

Free incluye 500 MB de base de datos, 1 GB de archivos, 5 GB de transferencia y 5 GB de transferencia desde caché. Los proyectos pueden pausarse después de una semana de inactividad. Revisar el panel antes de una demo y restaurar el proyecto si hace falta.

Las imágenes se comprimen en Android. La consulta condicional evita descargar resultados sin cambios. El panel maestro muestra tamaño de PostgreSQL (aproximación global, incluye estructuras internas) y metadatos de archivos; no inventa métricas de tráfico o lecturas ni envía alertas automáticas por correo.

Al reemplazar una foto, su ruta se encola en private.file_cleanup. Ejecutar npm run storage:cleanup para eliminar los objetos por la API de Storage y liberar espacio. El workflow de mantenimiento puede hacerlo diariamente si se configuran sus secretos. No borrar directamente storage.objects por SQL.

No hay respaldo automático del plan gratuito ni garantía de disponibilidad para producción. Conservar exportaciones y comprobar restauración. No incluir Redis, servidores de API ni microservicios adicionales para esta demo.
