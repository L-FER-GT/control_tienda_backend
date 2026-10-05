# Seguridad

RLS de documents solo concede SELECT. Escrituras desde Android pasan por ct_commit; cada ruta tiene permisos explícitos y todo lo demás se rechaza. Las funciones privadas no son ejecutables por clientes, salvo las funciones puras/lectoras usadas en políticas.

owner administra su tienda. employee vende y recibe permisos delegados. client/visitante solo consulta el catálogo autorizado. Usuarios deshabilitados quedan bloqueados también con tokens ya emitidos. Los cambios de membresía se comprueban de nuevo al sincronizar.

ct_commit valida cada operación dentro de una transacción, con recibo de idempotencia. Ventas y recepciones nunca dependen de un trigger externo eventualmente consistente. Solo el servidor asigna correlativos y confirma ventas.

Storage media es privado. Catálogo visible según tienda; facturas solo para receptions/reports. Cargas por permisos y ruta. Las claves de administración no se distribuyen a clientes.

Las notificaciones quedan en documentos privados de cada usuario. No hay FCM ni push de fondo. Una caché autorizada previamente puede seguir viéndose offline en el mismo dispositivo y cuenta; una revocación remota solo se conoce al reconectar.
