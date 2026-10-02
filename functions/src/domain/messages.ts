import type { UsageMetric } from "./quotas";

export type InvitationRole = "employee" | "client";

export interface NotificationText {
  title: string;
  body: string;
}

export function roleLabel(role: InvitationRole): string {
  return role === "employee" ? "empleado" : "cliente";
}

export function invitationText(fromName: string, storeName: string, role: InvitationRole): NotificationText {
  return {
    title: `Invitación a ${storeName}`,
    body: `${fromName} te invita a unirte a "${storeName}" como ${roleLabel(role)}.`,
  };
}

export function invitationResponseText(toName: string, storeName: string, accepted: boolean): NotificationText {
  return accepted
    ? { title: "Invitación aceptada", body: `${toName} aceptó unirse a "${storeName}".` }
    : { title: "Invitación rechazada", body: `${toName} rechazó la invitación a "${storeName}".` };
}

export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export function formatUsage(metric: Pick<UsageMetric, "used" | "unit">): string {
  return metric.unit === "bytes" ? formatBytes(metric.used) : `${Math.round(metric.used).toLocaleString("es-PE")} ${metric.unit}`;
}

export function usageAlertText(metric: UsageMetric): NotificationText {
  const percent = Math.floor(metric.ratio * 100);
  const limit = formatUsage({ used: metric.limit, unit: metric.unit });
  const used = formatUsage(metric);
  const period = metric.period === "DAY" ? "hoy" : metric.period === "MONTH" ? "este mes" : "en total";
  return {
    title: metric.level === "EXCEEDED" ? `Cuota superada: ${metric.label}` : `Consumo al ${percent} %: ${metric.label}`,
    body: `${used} de ${limit} ${period}. Revisa las opciones maestras > Consumo.`,
  };
}
