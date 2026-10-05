# Arquitectura

Android -> Supabase Auth (sesión JWT) -> PostgREST RPC -> PostgreSQL.
Android -> Supabase Storage (bucket privado media).

Se conservan los modelos de dominio como documentos JSONB en public.documents: path identifica el recurso y data contiene sus campos. Esto evita una conversión innecesaria de los modelos Kotlin. Es PostgreSQL con índices y RLS, no un emulador de Firestore.

Lecturas: ct_query(query) aplica RLS; ct_poll(query, etag) devuelve rows=null cuando el resultado autorizado no cambió. Cada página tiene hasta 500 registros. La app consulta cada 15 segundos solo mientras observa una pantalla; no usa Supabase Realtime ni garantiza cambios instantáneos.

Escrituras: ct_commit(operation_id, operations) valida identidad, permisos, estructura y reglas. Cada operación contiene path, kind (set/update/delete) y data. El lote es atómico. private.receipts conserva la identidad del lote para que un reintento no duplique ventas ni efectos. No borrar receipts mientras existan clientes con reintentos pendientes.

Las ventas asignan correlativo y descuentan stock en la misma transacción. Editar recepciones aplica la diferencia de cantidades y genera historial de costos. Un bloqueo transaccional serializa escrituras para la demo de tres conexiones; debe revisarse antes de escalar.

ct_call(action,payload) implementa bootstrapUser, respondInvitation, deleteAccount, adminGetUsage, adminSetUserDisabled y adminSetStoreDisabled. Las funciones privilegiadas verifican el usuario y tienen search_path fijo.

Android conserva una caché SQLite y una cola persistente separada por usuario. WorkManager y las pantallas reintentan; los rechazos definitivos revierten la vista local de ese lote y generan un aviso. No hay push con la app cerrada. Los avisos e invitaciones se consultan dentro de la app.
