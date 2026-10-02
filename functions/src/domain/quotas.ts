import { localDateId, startOfDayInZone, startOfMonthInZone } from "./time";

export type UsagePeriod = "DAY" | "MONTH" | "TOTAL";
export type UsageLevel = "OK" | "WARNING" | "EXCEEDED";

export interface QuotaDefinition {
  key: string;
  label: string;
  /** Cuota gratuita del plan Blaze. */
  limit: number;
  unit: "lecturas" | "escrituras" | "borrados" | "bytes" | "ejecuciones";
  period: UsagePeriod;
}

export interface UsageMetric extends QuotaDefinition {
  used: number;
  ratio: number;
  level: UsageLevel;
}

const GIB = 1024 ** 3;

/** Umbral de alerta: 80 % de la cuota gratuita. */
export const WARNING_RATIO = 0.8;

/**
 * Cuotas sin costo del plan Blaze (revisadas en docs/03-plan-blaze-cuotas-y-alertas.md).
 * Cloud Storage solo es gratuito si el bucket está en us-east1, us-central1 o us-west1.
 */
export const FREE_QUOTAS: readonly QuotaDefinition[] = [
  { key: "firestore_reads", label: "Lecturas de Firestore", limit: 50_000, unit: "lecturas", period: "DAY" },
  { key: "firestore_writes", label: "Escrituras de Firestore", limit: 20_000, unit: "escrituras", period: "DAY" },
  { key: "firestore_deletes", label: "Borrados de Firestore", limit: 20_000, unit: "borrados", period: "DAY" },
  { key: "storage_bytes", label: "Fotos y archivos guardados", limit: 5 * GIB, unit: "bytes", period: "TOTAL" },
  { key: "storage_egress", label: "Descarga de fotos y archivos", limit: 100 * GIB, unit: "bytes", period: "MONTH" },
  {
    key: "functions_invocations",
    label: "Ejecuciones de Cloud Functions",
    limit: 2_000_000,
    unit: "ejecuciones",
    period: "MONTH",
  },
];

export function levelOf(used: number, limit: number): UsageLevel {
  const ratio = limit <= 0 ? 0 : used / limit;
  if (ratio >= 1) return "EXCEEDED";
  if (ratio >= WARNING_RATIO) return "WARNING";
  return "OK";
}

export function toMetric(quota: QuotaDefinition, used: number): UsageMetric {
  const safeUsed = Number.isFinite(used) && used > 0 ? used : 0;
  return {
    ...quota,
    used: safeUsed,
    ratio: quota.limit <= 0 ? 0 : safeUsed / quota.limit,
    level: levelOf(safeUsed, quota.limit),
  };
}

/** Inicio de la ventana de medición de la cuota. null para cuotas acumuladas (almacenamiento). */
export function windowStart(period: UsagePeriod, now: Date): Date | null {
  switch (period) {
    case "DAY":
      return startOfDayInZone(now);
    case "MONTH":
      return startOfMonthInZone(now);
    case "TOTAL":
      return null;
  }
}

/** Identificador del periodo actual, para no repetir la misma alerta dentro del periodo. */
export function periodId(period: UsagePeriod, now: Date): string {
  const day = localDateId(now);
  switch (period) {
    case "DAY":
      return day;
    case "MONTH":
      return day.slice(0, 7);
    case "TOTAL":
      return day; // el almacenamiento se vuelve a avisar como máximo una vez al día
  }
}
