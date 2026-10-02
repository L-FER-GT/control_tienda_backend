import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore";
import {
  EMPTY_LEDGER,
  ledgerFrom,
  orderStockDeltas,
  receptionCostChanges,
  receptionStockDeltas,
  roundQty,
  type ReceptionLedger,
  type ReceptionLineLike,
} from "../domain/stock";
import { db } from "./firebase";

/**
 * Procesa una orden sincronizada: le asigna el número correlativo de la tienda y descuenta
 * el stock de los productos registrados. Es idempotente (los triggers pueden repetirse).
 */
export async function processOrder(storeId: string, orderId: string): Promise<number | null> {
  const orderRef = db.doc(`stores/${storeId}/orders/${orderId}`);
  const counterRef = db.doc(`stores/${storeId}/meta/counters`);

  return db.runTransaction(async (tx) => {
    const [orderSnap, counterSnap] = await tx.getAll(orderRef, counterRef);
    if (!orderSnap.exists) return null;
    const order = orderSnap.data()!;
    if (order.number != null && order.stockApplied === true) return order.number as number;

    const deltas = order.stockApplied === true ? {} : orderStockDeltas(order.items ?? []);
    const productRefs = Object.keys(deltas).map((id) => db.doc(`stores/${storeId}/products/${id}`));
    const products: DocumentSnapshot[] = productRefs.length > 0 ? await tx.getAll(...productRefs) : [];

    const number = order.number ?? (counterSnap.get("orderSeq") ?? 0) + 1;
    const now = FieldValue.serverTimestamp();
    if (order.number == null) tx.set(counterRef, { orderSeq: number }, { merge: true });

    for (const product of products) {
      const stock = product.get("stock");
      // stock null = ilimitado: no se toca. Puede quedar negativo.
      if (!product.exists || typeof stock !== "number") continue;
      tx.update(product.ref, { stock: roundQty(stock + deltas[product.id]), updatedAt: now });
    }
    tx.update(orderRef, { number, status: "confirmed", stockApplied: true, syncedAt: now });
    return number as number;
  });
}

/**
 * Aplica una recepción de mercadería (creada, editada o borrada):
 *  - Suma al stock solo la diferencia respecto de lo ya aplicado (ledger por recepción).
 *  - Si cambia el costo unitario, actualiza el costo de compra del producto y su historial.
 */
export async function processReception(storeId: string, receptionId: string): Promise<void> {
  const receptionRef = db.doc(`stores/${storeId}/receptions/${receptionId}`);
  const ledgerRef = db.doc(`stores/${storeId}/ledgers/${receptionId}`);

  await db.runTransaction(async (tx) => {
    const [receptionSnap, ledgerSnap] = await tx.getAll(receptionRef, ledgerRef);
    const applied: ReceptionLedger = ledgerSnap.exists
      ? { quantities: ledgerSnap.get("quantities") ?? {}, costs: ledgerSnap.get("costs") ?? {} }
      : EMPTY_LEDGER;
    const lines: ReceptionLineLike[] = receptionSnap.exists ? receptionSnap.get("lines") ?? [] : [];

    const deltas = receptionStockDeltas(applied, lines);
    const costs = receptionCostChanges(applied, lines);
    const ids = [...new Set([...Object.keys(deltas), ...Object.keys(costs)])];
    const products: DocumentSnapshot[] =
      ids.length > 0 ? await tx.getAll(...ids.map((id) => db.doc(`stores/${storeId}/products/${id}`))) : [];

    const now = FieldValue.serverTimestamp();
    for (const product of products) {
      if (!product.exists) continue;
      const update: Record<string, unknown> = {};
      const stock = product.get("stock");
      const delta = deltas[product.id];
      if (delta !== undefined && typeof stock === "number") update.stock = roundQty(stock + delta);

      const cost = costs[product.id];
      if (cost !== undefined && product.get("purchaseCostCents") !== cost) {
        update.purchaseCostCents = cost;
        tx.set(product.ref.collection("priceHistory").doc(), {
          salePriceCents: product.get("salePriceCents") ?? null,
          purchaseCostCents: cost,
          source: "reception",
          refId: receptionId,
          changedBy: receptionSnap.get("updatedBy") ?? receptionSnap.get("createdBy") ?? null,
          changedByName: receptionSnap.get("updatedByName") ?? receptionSnap.get("createdByName") ?? "Recepción",
          at: now,
        });
      }
      if (Object.keys(update).length > 0) tx.update(product.ref, { ...update, updatedAt: now });
    }

    if (receptionSnap.exists) tx.set(ledgerRef, ledgerFrom(lines));
    else if (ledgerSnap.exists) tx.delete(ledgerRef);
  });
}
