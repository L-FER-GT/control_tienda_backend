import { describe, expect, it } from "vitest";
import type {
  NewNotification,
  NotificationWriter,
  PushPayload,
  PushSender,
  SuperadminDirectory,
  UsageAlertLog,
  UsageSource,
} from "../src/application/ports";
import { buildUsageReport, runUsageWatchdog } from "../src/application/usage";
import type { QuotaDefinition } from "../src/domain/quotas";

class FixedSource implements UsageSource {
  readonly name = "emulator" as const;
  constructor(private readonly ratios: Record<string, number>, private readonly failing: string[] = []) {}
  async read(quota: QuotaDefinition): Promise<number> {
    if (this.failing.includes(quota.key)) throw new Error("boom");
    return quota.limit * (this.ratios[quota.key] ?? 0);
  }
}

class MemoryAlerts implements UsageAlertLog {
  readonly keys = new Set<string>();
  async wasNotified(key: string) {
    return this.keys.has(key);
  }
  async markNotified(key: string) {
    this.keys.add(key);
  }
}

class MemoryNotifications implements NotificationWriter {
  readonly sent: { uid: string; n: NewNotification }[] = [];
  async create(uid: string, n: NewNotification) {
    this.sent.push({ uid, n });
  }
}

class MemoryPush implements PushSender {
  readonly sent: { uid: string; payload: PushPayload }[] = [];
  async sendToUser(uid: string, payload: PushPayload) {
    this.sent.push({ uid, payload });
  }
}

const admins: SuperadminDirectory = { listSuperadminIds: async () => ["root"] };
const now = new Date("2026-10-01T15:00:00Z");

describe("reporte de consumo", () => {
  it("marca el nivel de cada recurso y tolera métricas que fallan", async () => {
    const report = await buildUsageReport(new FixedSource({ firestore_reads: 0.85 }, ["storage_bytes"]), now);
    const reads = report.metrics.find((m) => m.key === "firestore_reads")!;
    expect(reads.level).toBe("WARNING");
    expect(report.metrics.find((m) => m.key === "storage_bytes")!.error).toBe(true);
  });
});

describe("vigilante de consumo", () => {
  it("avisa al superadmin una sola vez por periodo y nivel", async () => {
    const deps = {
      source: new FixedSource({ firestore_writes: 0.9 }),
      alerts: new MemoryAlerts(),
      superadmins: admins,
      notifications: new MemoryNotifications(),
      push: new MemoryPush(),
    };
    expect(await runUsageWatchdog(deps, now)).toEqual(["firestore_writes:2026-10-01:WARNING"]);
    expect(await runUsageWatchdog(deps, now)).toEqual([]);
    expect(deps.notifications.sent).toHaveLength(1);
    expect(deps.notifications.sent[0].n.type).toBe("usage_alert");
    expect(deps.push.sent).toHaveLength(1);

    // Si luego supera la cuota, se envía la alerta de nivel EXCEEDED.
    deps.source = new FixedSource({ firestore_writes: 1.2 });
    expect(await runUsageWatchdog(deps, now)).toEqual(["firestore_writes:2026-10-01:EXCEEDED"]);
  });

  it("no envía nada si todo está bajo el 80 %", async () => {
    const notifications = new MemoryNotifications();
    const sent = await runUsageWatchdog(
      { source: new FixedSource({ firestore_reads: 0.5 }), alerts: new MemoryAlerts(), superadmins: admins, notifications, push: new MemoryPush() },
      now,
    );
    expect(sent).toEqual([]);
    expect(notifications.sent).toHaveLength(0);
  });
});
