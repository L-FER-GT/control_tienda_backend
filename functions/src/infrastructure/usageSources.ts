import { MetricServiceClient } from "@google-cloud/monitoring";
import type { UsageSource } from "../application/ports";
import { windowStart, type QuotaDefinition } from "../domain/quotas";
import { projectId } from "./firebase";

interface MetricQuery {
  /** Se prueba cada filtro en orden hasta encontrar datos (los nombres de métricas cambian con el tiempo). */
  filters: string[];
  kind: "DELTA" | "GAUGE";
}

const METRICS: Record<string, MetricQuery> = {
  firestore_reads: {
    kind: "DELTA",
    filters: [
      'metric.type="firestore.googleapis.com/document/read_ops_count"',
      'metric.type="firestore.googleapis.com/document/read_count"',
    ],
  },
  firestore_writes: {
    kind: "DELTA",
    filters: [
      'metric.type="firestore.googleapis.com/document/write_ops_count"',
      'metric.type="firestore.googleapis.com/document/write_count"',
    ],
  },
  firestore_deletes: {
    kind: "DELTA",
    filters: [
      'metric.type="firestore.googleapis.com/document/delete_ops_count"',
      'metric.type="firestore.googleapis.com/document/delete_count"',
    ],
  },
  storage_bytes: {
    kind: "GAUGE",
    filters: [
      'metric.type="storage.googleapis.com/storage/v2/total_bytes"',
      'metric.type="storage.googleapis.com/storage/total_bytes"',
    ],
  },
  storage_egress: {
    kind: "DELTA",
    filters: ['metric.type="storage.googleapis.com/network/sent_bytes_count"'],
  },
  functions_invocations: {
    kind: "DELTA",
    // Las funciones 2ª generación corren sobre Cloud Run.
    filters: ['metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"'],
  },
};

type Point = { value?: { int64Value?: string | number | null; doubleValue?: number | null } | null; interval?: { endTime?: { seconds?: string | number | null } | null } | null };

function pointValue(point: Point): number {
  const v = point.value;
  if (!v) return 0;
  if (v.doubleValue != null) return Number(v.doubleValue);
  if (v.int64Value != null) return Number(v.int64Value);
  return 0;
}

/** Lee el consumo real desde Cloud Monitoring (requiere el rol "Monitoring Viewer" en la cuenta de servicio). */
export class CloudMonitoringUsageSource implements UsageSource {
  readonly name = "monitoring" as const;
  private readonly client = new MetricServiceClient();

  async read(quota: QuotaDefinition, now: Date): Promise<number> {
    const query = METRICS[quota.key];
    if (!query) return 0;
    for (const filter of query.filters) {
      const value = query.kind === "DELTA" ? await this.sumDelta(filter, quota, now) : await this.latestGauge(filter, now);
      if (value !== null) return value;
    }
    return 0;
  }

  private async sumDelta(filter: string, quota: QuotaDefinition, now: Date): Promise<number | null> {
    const start = windowStart(quota.period, now) ?? new Date(now.getTime() - 86_400_000);
    const seconds = Math.max(60, Math.floor((now.getTime() - start.getTime()) / 1000));
    const [series] = await this.client.listTimeSeries({
      name: this.client.projectPath(projectId()),
      filter,
      interval: {
        startTime: { seconds: Math.floor(start.getTime() / 1000) },
        endTime: { seconds: Math.floor(now.getTime() / 1000) },
      },
      aggregation: {
        alignmentPeriod: { seconds },
        perSeriesAligner: "ALIGN_SUM",
        crossSeriesReducer: "REDUCE_SUM",
      },
    });
    if (!series || series.length === 0) return null;
    return series.flatMap((s) => (s.points ?? []) as Point[]).reduce((acc, p) => acc + pointValue(p), 0);
  }

  private async latestGauge(filter: string, now: Date): Promise<number | null> {
    // El almacenamiento de Cloud Storage se muestrea una vez al día: se miran los últimos 3 días.
    const start = new Date(now.getTime() - 3 * 86_400_000);
    const [series] = await this.client.listTimeSeries({
      name: this.client.projectPath(projectId()),
      filter,
      interval: {
        startTime: { seconds: Math.floor(start.getTime() / 1000) },
        endTime: { seconds: Math.floor(now.getTime() / 1000) },
      },
      aggregation: {
        alignmentPeriod: { seconds: 86_400 },
        perSeriesAligner: "ALIGN_MAX",
        crossSeriesReducer: "REDUCE_SUM",
      },
    });
    if (!series || series.length === 0) return null;
    const points = series.flatMap((s) => (s.points ?? []) as Point[]);
    if (points.length === 0) return null;
    const latest = points.reduce((a, b) =>
      Number(a.interval?.endTime?.seconds ?? 0) >= Number(b.interval?.endTime?.seconds ?? 0) ? a : b,
    );
    return pointValue(latest);
  }
}

/**
 * En el emulador no hay Cloud Monitoring: devuelve valores de ejemplo para poder
 * probar la pantalla de consumo (uno de ellos supera el 80 % a propósito).
 */
export class EmulatorUsageSource implements UsageSource {
  readonly name = "emulator" as const;
  private readonly sample: Record<string, number> = {
    firestore_reads: 0.42,
    firestore_writes: 0.83,
    firestore_deletes: 0.05,
    storage_bytes: 0.12,
    storage_egress: 0.3,
    functions_invocations: 0.01,
  };

  async read(quota: QuotaDefinition): Promise<number> {
    return Math.round(quota.limit * (this.sample[quota.key] ?? 0));
  }
}
