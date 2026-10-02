/**
 * Reglas de inventario:
 *  - Una venta concretada descuenta stock de los productos registrados (los ítems manuales no).
 *  - Una recepción de mercadería suma stock; si se edita o borra, se aplica solo la diferencia.
 *  - Los productos con stock null tienen stock ilimitado y no se modifican.
 *  - El stock puede quedar negativo: las ventas nunca se bloquean.
 */

export interface OrderItemLike {
  productId?: string | null;
  quantity: number;
  manual?: boolean;
}

export interface ReceptionLineLike {
  productId: string;
  quantity: number;
  unitCostCents?: number | null;
}

/** Ledger guardado por el servidor con lo que ya se aplicó de cada recepción. */
export interface ReceptionLedger {
  quantities: Record<string, number>;
  costs: Record<string, number | null>;
}

export const EMPTY_LEDGER: ReceptionLedger = { quantities: {}, costs: {} };

/** Evita arrastrar errores de punto flotante (0.1 + 0.2). */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** productId -> cantidad a restar (negativa) por una venta. */
export function orderStockDeltas(items: readonly OrderItemLike[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const item of items) {
    if (!item.productId || item.manual || !(item.quantity > 0)) continue;
    deltas[item.productId] = roundQty((deltas[item.productId] ?? 0) - item.quantity);
  }
  return deltas;
}

export function quantitiesByProduct(lines: readonly ReceptionLineLike[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of lines) {
    if (!line.productId || !(line.quantity > 0)) continue;
    result[line.productId] = roundQty((result[line.productId] ?? 0) + line.quantity);
  }
  return result;
}

/** Último costo informado por producto en la recepción. */
export function costsByProduct(lines: readonly ReceptionLineLike[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const line of lines) {
    if (!line.productId) continue;
    result[line.productId] = typeof line.unitCostCents === "number" ? line.unitCostCents : null;
  }
  return result;
}

/** Diferencia de stock entre lo ya aplicado y la nueva versión de la recepción (o [] si se borró). */
export function receptionStockDeltas(
  applied: ReceptionLedger,
  next: readonly ReceptionLineLike[],
): Record<string, number> {
  const nextQty = quantitiesByProduct(next);
  const deltas: Record<string, number> = {};
  const ids = new Set([...Object.keys(applied.quantities), ...Object.keys(nextQty)]);
  for (const id of ids) {
    const delta = roundQty((nextQty[id] ?? 0) - (applied.quantities[id] ?? 0));
    if (delta !== 0) deltas[id] = delta;
  }
  return deltas;
}

/** Costos nuevos o cambiados respecto de lo ya aplicado (para actualizar el producto y su historial). */
export function receptionCostChanges(
  applied: ReceptionLedger,
  next: readonly ReceptionLineLike[],
): Record<string, number> {
  const nextCosts = costsByProduct(next);
  const changes: Record<string, number> = {};
  for (const [id, cost] of Object.entries(nextCosts)) {
    if (cost !== null && applied.costs[id] !== cost) changes[id] = cost;
  }
  return changes;
}

export function ledgerFrom(lines: readonly ReceptionLineLike[]): ReceptionLedger {
  return { quantities: quantitiesByProduct(lines), costs: costsByProduct(lines) };
}
