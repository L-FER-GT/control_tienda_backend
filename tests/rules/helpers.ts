import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";

export const PROJECT_ID = "demo-control-tienda";

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
}

export type Role = "owner" | "employee" | "client";

export function storeData(ownerId: string, overrides: Record<string, unknown> = {}) {
  return {
    name: "Bodega Rosita",
    nameLower: "bodega rosita",
    address: "Jr. Lima 123",
    photoPath: null,
    isPublic: false,
    currency: "PEN",
    ownerId,
    ownerName: "Rosa",
    disabledBySystem: false,
    ...overrides,
  };
}

export function memberData(uid: string, role: Role, permissions: string[] = [], active = true) {
  return { uid, role, permissions, active, displayName: uid, photoPath: null, code: "1234567890" };
}

export function productData(overrides: Record<string, unknown> = {}) {
  return {
    name: "Arroz",
    nameLower: "arroz",
    categoryId: null,
    salePriceCents: 450,
    purchaseCostCents: null,
    unit: "unit",
    stock: 10,
    stockAlert: null,
    barcode: "7750000000001",
    qrCode: null,
    photoPath: null,
    ...overrides,
  };
}

export function orderData(createdBy: string, overrides: Record<string, unknown> = {}) {
  return {
    number: null,
    status: "pending",
    stockApplied: false,
    createdBy,
    createdByName: createdBy,
    createdAt: Timestamp.now(),
    paymentMethod: "cash",
    currency: "PEN",
    items: [{ productId: "p1", description: "Arroz", quantity: 1, unitPriceCents: 450, manual: false }],
    totalCents: 450,
    ...overrides,
  };
}

/**
 * Tienda "s1" con dueño "owner", empleados con y sin permisos, un cliente y un empleado deshabilitado.
 */
export async function seedStore(env: RulesTestEnvironment, storeOverrides: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx: RulesTestContext) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "stores/s1"), storeData("owner", storeOverrides));
    await setDoc(doc(db, "stores/s1/members/owner"), memberData("owner", "owner"));
    await setDoc(doc(db, "stores/s1/members/emp"), memberData("emp", "employee"));
    await setDoc(
      doc(db, "stores/s1/members/boss"),
      memberData("boss", "employee", ["manage_products", "members", "reports"]),
    );
    await setDoc(doc(db, "stores/s1/members/cats"), memberData("cats", "employee", ["manage_categories"]));
    await setDoc(doc(db, "stores/s1/members/cli"), memberData("cli", "client"));
    await setDoc(doc(db, "stores/s1/members/off"), memberData("off", "employee", ["manage_products"], false));
    await setDoc(doc(db, "stores/s1/products/p1"), productData());
  });
}
