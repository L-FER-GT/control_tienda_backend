/**
 * Pruebas de integración contra el emulador de Firestore (npm run test:integration en la raíz).
 */
import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { NewNotification, NotificationWriter, PushPayload, PushSender } from "../../src/application/ports";
import { db } from "../../src/infrastructure/firebase";
import { processOrder, processReception } from "../../src/infrastructure/inventory";
import { respondInvitation } from "../../src/infrastructure/invitations";
import { bootstrapUser } from "../../src/infrastructure/users";

class MemoryNotifications implements NotificationWriter {
  readonly sent: { uid: string; n: NewNotification }[] = [];
  async create(uid: string, n: NewNotification) {
    this.sent.push({ uid, n });
  }
}
class NoPush implements PushSender {
  async sendToUser(_uid: string, _payload: PushPayload) {}
}

async function clear() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT ?? "demo-control-tienda";
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
}

beforeEach(clear);
afterAll(clear);

describe("ventas", () => {
  it("asigna números correlativos y descuenta stock (sin tocar stock ilimitado)", async () => {
    await db.doc("stores/s1/products/a").set({ name: "A", stock: 5, salePriceCents: 100 });
    await db.doc("stores/s1/products/b").set({ name: "B", stock: null, salePriceCents: 100 });
    const items = [
      { productId: "a", quantity: 2, manual: false },
      { productId: "b", quantity: 1, manual: false },
      { productId: null, quantity: 4, manual: true },
    ];
    await db.doc("stores/s1/orders/o1").set({ number: null, status: "pending", items, createdAt: Timestamp.now() });
    await db.doc("stores/s1/orders/o2").set({ number: null, status: "pending", items, createdAt: Timestamp.now() });

    expect(await processOrder("s1", "o1")).toBe(1);
    expect(await processOrder("s1", "o2")).toBe(2);
    // Reintento del trigger: no vuelve a descontar ni cambia el número
    expect(await processOrder("s1", "o1")).toBe(1);

    expect((await db.doc("stores/s1/products/a").get()).get("stock")).toBe(1);
    expect((await db.doc("stores/s1/products/b").get()).get("stock")).toBeNull();
    expect((await db.doc("stores/s1/orders/o1").get()).get("status")).toBe("confirmed");
  });

  it("el stock puede quedar negativo", async () => {
    await db.doc("stores/s1/products/a").set({ name: "A", stock: 1, salePriceCents: 100 });
    await db.doc("stores/s1/orders/o1").set({ number: null, items: [{ productId: "a", quantity: 3 }] });
    await processOrder("s1", "o1");
    expect((await db.doc("stores/s1/products/a").get()).get("stock")).toBe(-2);
  });
});

describe("recepciones", () => {
  it("suma stock, registra el costo y al editar o borrar aplica solo la diferencia", async () => {
    await db.doc("stores/s1/products/a").set({ name: "A", stock: 0, salePriceCents: 500, purchaseCostCents: null });
    const ref = db.doc("stores/s1/receptions/r1");
    await ref.set({ lines: [{ productId: "a", quantity: 10, unitCostCents: 300 }], createdByName: "Ana" });
    await processReception("s1", "r1");

    let product = await db.doc("stores/s1/products/a").get();
    expect(product.get("stock")).toBe(10);
    expect(product.get("purchaseCostCents")).toBe(300);
    const history = await db.collection("stores/s1/products/a/priceHistory").get();
    expect(history.size).toBe(1);
    expect(history.docs[0].get("source")).toBe("reception");

    await ref.update({ lines: [{ productId: "a", quantity: 7, unitCostCents: 320 }] });
    await processReception("s1", "r1");
    await processReception("s1", "r1"); // idempotente
    product = await db.doc("stores/s1/products/a").get();
    expect(product.get("stock")).toBe(7);
    expect(product.get("purchaseCostCents")).toBe(320);
    expect((await db.collection("stores/s1/products/a/priceHistory").get()).size).toBe(2);

    await ref.delete();
    await processReception("s1", "r1");
    expect((await db.doc("stores/s1/products/a").get()).get("stock")).toBe(0);
    expect((await db.doc("stores/s1/ledgers/r1").get()).exists).toBe(false);
  });
});

describe("usuarios e invitaciones", () => {
  it("bootstrapUser es idempotente y genera un código único", async () => {
    const first = await bootstrapUser("u1", { email: "ana@correo.com", name: "  Ana   Pérez " });
    const again = await bootstrapUser("u1", { email: "ana@correo.com", name: "Otro" });
    expect(first.code).toHaveLength(10);
    expect(again.code).toBe(first.code);
    expect(first.displayName).toBe("Ana Pérez");
    expect((await db.doc(`userCodes/${first.code}`).get()).get("uid")).toBe("u1");
    expect((await db.doc("publicProfiles/u1").get()).get("displayNameLower")).toBe("ana pérez");
  });

  it("aceptar una invitación crea la membresía y avisa al que invitó", async () => {
    await bootstrapUser("nuevo", { email: "n@correo.com", name: "Nuevo" });
    await db.doc("stores/s1").set({ name: "Bodega", ownerId: "owner", disabledBySystem: false });
    await db.doc("stores/s1/invitations/i1").set({
      storeId: "s1", storeName: "Bodega", fromUid: "owner", fromName: "Dueña",
      toUid: "nuevo", toName: "Nuevo", role: "employee", status: "pending",
    });
    const notifications = new MemoryNotifications();

    await expect(respondInvitation("otro", "s1", "i1", true, notifications, new NoPush())).rejects.toThrow();
    const result = await respondInvitation("nuevo", "s1", "i1", true, notifications, new NoPush());
    expect(result.status).toBe("accepted");

    const member = await db.doc("stores/s1/members/nuevo").get();
    expect(member.get("role")).toBe("employee");
    expect(member.get("active")).toBe(true);
    expect(member.get("permissions")).toEqual([]);
    expect(notifications.sent[0].uid).toBe("owner");
    expect(notifications.sent[0].n.type).toBe("invitation_response");

    await expect(respondInvitation("nuevo", "s1", "i1", true, notifications, new NoPush())).rejects.toThrow(
      "Ya respondiste esta invitación.",
    );
  });
});
