import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { runUsageWatchdog } from "../application/usage";
import { isEmulator } from "../infrastructure/firebase";
import {
  FcmPushSender,
  FirestoreNotificationWriter,
  FirestoreSuperadminDirectory,
  FirestoreUsageAlertLog,
} from "../infrastructure/notifications";
import { CloudMonitoringUsageSource, EmulatorUsageSource } from "../infrastructure/usageSources";

/**
 * Cada 6 horas revisa el consumo de Firebase y avisa al superadmin (notificación + push)
 * cuando un recurso llega al 80 % de su cuota gratuita o la supera.
 */
export const usageWatchdog = onSchedule({ schedule: "every 6 hours", timeZone: "America/Lima" }, async () => {
  const sent = await runUsageWatchdog(
    {
      source: isEmulator ? new EmulatorUsageSource() : new CloudMonitoringUsageSource(),
      alerts: new FirestoreUsageAlertLog(),
      superadmins: new FirestoreSuperadminDirectory(),
      notifications: new FirestoreNotificationWriter(),
      push: new FcmPushSender(),
    },
    new Date(),
  );
  logger.info(sent.length > 0 ? `Alertas de consumo enviadas: ${sent.join(", ")}` : "Consumo dentro de los límites");
});
