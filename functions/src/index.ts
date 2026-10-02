import { setGlobalOptions } from "firebase-functions/v2";

/*
 * Control Tienda - Cloud Functions (2ª generación)
 *
 * Arquitectura hexagonal:
 *   domain/          reglas puras (código de usuario, cuotas, stock, mensajes)
 *   application/     casos de uso y puertos (consumo y alertas)
 *   infrastructure/  adaptadores: Firestore, Storage, Auth, FCM, Cloud Monitoring
 *   entrypoints/     adaptadores de entrada: callables, triggers y tareas programadas
 *
 * Región us-east1: misma región que Firestore y el bucket (requisito del nivel gratuito de Storage).
 * maxInstances limita el gasto si hubiera un pico inesperado de tráfico.
 */
setGlobalOptions({ region: "us-east1", maxInstances: 10, memory: "256MiB" });

export * from "./entrypoints/callables";
export * from "./entrypoints/triggers";
export * from "./entrypoints/scheduled";
