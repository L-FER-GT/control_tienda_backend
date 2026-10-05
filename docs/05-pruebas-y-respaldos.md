# Pruebas y respaldos

npm test ejecuta PostgreSQL WASM sin Docker ni credenciales. Los tests instalan los SQL reales y cambian entre roles anon/authenticated; Auth/Storage como servicios externos requieren la prueba alojada.

npm run test:live usa las credenciales del administrador para comprobar login, perfil y consulta. No escribe ventas ni crea tiendas. Solo ejecutarlo después de las migraciones y la creación del administrador.

Prueba de aceptación: crear tienda y producto con stock 20; invitar empleado y cliente; vender 2 unidades offline; cerrar y abrir la app; reconectar; comprobar stock 18 y un único correlativo en ambos celulares; editar una recepción; retirar permisos antes de sincronizar; comprobar rechazo y corrección local. Un cliente no debe leer ventas/facturas ni modificar catálogo.

npm run backup exporta documents a backups/ (ignorado por Git). Es un respaldo lógico de datos de negocio, no un respaldo completo: las cuentas Auth, claves y objetos Storage no se incluyen. Para recuperación completa conservar además el dump de PostgreSQL/Auth mediante las herramientas de Supabase y descargar el bucket mediante la API de Storage. Restaurar primero en un proyecto de prueba y validar IDs y permisos.

No se transfiere automáticamente el contenido de Firebase ni los hashes de contraseñas. Si existen datos históricos, exportarlos y planificar el mapeo Firebase UID -> Supabase UUID antes de activar clientes reales. Un proyecto nuevo de producción no necesita importar esos datos.
