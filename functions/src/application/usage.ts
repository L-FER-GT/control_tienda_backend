import { FREE_QUOTAS, periodId, toMetric, type UsageMetric } from "../domain/quotas";
import { usageAlertText } from "../domain/messages";
import type { NotificationWriter, PushSender, SuperadminDirectory, UsageAlertLog, UsageSource } from "./ports";

export interface UsageReport {
  metrics: (UsageMetric & { error?: boolean })[];
  generatedAt: number;
  source: UsageSource["name"];
}

/** Consumo actual de cada recurso frente a su cuota gratuita. */
export async function buildUsageReport(source: UsageSource, now: Date): Promise<UsageReport> {
  const metrics = await Promise.all(
    FREE_QUOTAS.map(async (quota) => {
      try {
        return toMetric(quota, await source.read(quota, now));
      } catch (error) {
        console.warn(`No se pudo leer la métrica ${quota.key}`, error);
        return { ...toMetric(quota, 0), error: true };
      }
    }),
  );
  return { metrics, generatedAt: now.getTime(), source: source.name };
}

export interface WatchdogDeps {
  source: UsageSource;
  alerts: UsageAlertLog;
  superadmins: SuperadminDirectory;
  notifications: NotificationWriter;
  push: PushSender;
}

/**
 * Revisa el consumo y avisa al superadmin cuando un recurso llega al 80 % (o lo supera).
 * Cada nivel se avisa una sola vez por periodo de la cuota.
 * Devuelve las claves de las alertas enviadas.
 */
export async function runUsageWatchdog(deps: WatchdogDeps, now: Date): Promise<string[]> {
  const report = await buildUsageReport(deps.source, now);
  const flagged = report.metrics.filter((m) => !m.error && m.level !== "OK");
  if (flagged.length === 0) return [];

  const admins = await deps.superadmins.listSuperadminIds();
  const sent: string[] = [];
  for (const metric of flagged) {
    const key = `${metric.key}:${periodId(metric.period, now)}:${metric.level}`;
    if (await deps.alerts.wasNotified(key)) continue;
    const text = usageAlertText(metric);
    for (const uid of admins) {
      await deps.notifications.create(uid, { type: "usage_alert", ...text }, `usage_${key.replace(/[:]/g, "_")}`);
      await deps.push.sendToUser(uid, { ...text, data: { type: "usage_alert" } });
    }
    await deps.alerts.markNotified(key);
    sent.push(key);
  }
  return sent;
}
