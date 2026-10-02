/**
 * Las cuotas diarias de Firestore se reinician a medianoche hora del Pacífico
 * y la facturación mensual de Google Cloud también usa esa zona horaria.
 */
export const QUOTA_TIME_ZONE = "America/Los_Angeles";

/** Diferencia (ms) entre la hora local de [timeZone] y UTC en el instante [date]. */
export function zoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) parts[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const truncated = date.getTime() - date.getUTCMilliseconds();
  return asUtc - truncated;
}

function localMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const localMidnight = Date.UTC(year, month, day);
  // Primera aproximación con el offset de ese momento y corrección por cambio de horario.
  const firstGuess = localMidnight - zoneOffsetMs(new Date(localMidnight), timeZone);
  return new Date(localMidnight - zoneOffsetMs(new Date(firstGuess), timeZone));
}

/** Inicio del día actual en [timeZone], expresado como instante UTC. */
export function startOfDayInZone(now: Date, timeZone: string = QUOTA_TIME_ZONE): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  return localMidnightToUtc(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), timeZone);
}

/** Inicio del mes actual en [timeZone], expresado como instante UTC. */
export function startOfMonthInZone(now: Date, timeZone: string = QUOTA_TIME_ZONE): Date {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  return localMidnightToUtc(local.getUTCFullYear(), local.getUTCMonth(), 1, timeZone);
}

/** "2026-10-01" en la zona indicada. */
export function localDateId(now: Date, timeZone: string = QUOTA_TIME_ZONE): string {
  const local = new Date(now.getTime() + zoneOffsetMs(now, timeZone));
  return local.toISOString().slice(0, 10);
}
