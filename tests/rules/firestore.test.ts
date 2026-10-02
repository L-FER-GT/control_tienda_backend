import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createEnv, memberData, orderData, productData, seedStore, storeData } from "./helpers";

let env: RulesTestEnvironment;
const as = (uid: string, claims: Record<string, unknown> = {}) => env.authenticatedContext(uid, claims).firestore();

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe("usuarios", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/ana"), {
        displayName: "Ana", email: "a@a.com", phone: null, photoPath: null, code: "1234567890",
        isSuperadmin: false, disabled: false,
      });
      await setDoc(doc(ctx.firestore(), "publicProfiles/ana"), {
        displayName: "Ana", displayNameLower: "ana", photoPath: null, code: "1234567890",
      });
      await setDoc(doc(ctx.firestore(), "userCodes/1234567890"), { uid: "ana" });
    });
  });

  it("cada usuario lee y edita solo su perfil, sin tocar código ni privilegios", async () => {
    await assertSucceeds(getDoc(doc(as("ana"), "users/ana")));
    await assertFails(getDoc(doc(as("luis"), "users/ana")));
    await assertSucceeds(updateDoc(doc(as("ana"), "users/ana"), { displayName: "Ana María" }));
    await assertFails(updateDoc(doc(as("ana"), "users/ana"), { isSuperadmin: true }));
    await assertFails(updateDoc(doc(as("ana"), "users/ana"), { code: "0000000000" }));
  });

  it("el superadmin puede leer cualquier perfil", async () => {
    await assertSucceeds(getDoc(doc(as("root", { superadmin: true }), "users/ana")));
  });

  it("los códigos se consultan uno a uno pero no se listan", async () => {
    await assertSucceeds(getDoc(doc(as("luis"), "userCodes/1234567890")));
    await assertFails(getDocs(collection(as("luis"), "userCodes")));
  });

  it("el perfil público exige nombre en minúsculas coherente", async () => {
    await assertSucceeds(updateDoc(doc(as("ana"), "publicProfiles/ana"), { displayName: "Ana", displayNameLower: "ana" }));
    await assertFails(updateDoc(doc(as("ana"), "publicProfiles/ana"), { displayName: "Ana", displayNameLower: "otra" }));
    await assertFails(updateDoc(doc(as("ana"), "publicProfiles/ana"), { code: "1111111111" }));
  });
});

describe("tiendas", () => {
  it("crear tienda + membresía de dueño en un mismo batch", async () => {
    const db = as("rosa");
    const batch = writeBatch(db);
    batch.set(doc(db, "stores/nueva"), storeData("rosa"));
    batch.set(doc(db, "stores/nueva/members/rosa"), memberData("rosa", "owner"));
    await assertSucceeds(batch.commit());
  });

  it("nadie se puede declarar dueño de una tienda ajena", async () => {
    await seedStore(env);
    await assertFails(setDoc(doc(as("intruso"), "stores/s1/members/intruso"), memberData("intruso", "owner")));
    await assertFails(setDoc(doc(as("intruso"), "stores/otra"), storeData("rosa")));
  });

  it("tienda privada solo para miembros; pública para cualquier usuario autenticado", async () => {
    await seedStore(env);
    await assertFails(getDoc(doc(as("extraño"), "stores/s1")));
    await assertSucceeds(getDoc(doc(as("cli"), "stores/s1")));
    await assertFails(getDoc(doc(as("off"), "stores/s1")));
    await env.clearFirestore();
    await seedStore(env, { isPublic: true });
    await assertSucceeds(getDoc(doc(as("extraño"), "stores/s1")));
    await assertSucceeds(getDocs(query(collection(as("extraño"), "stores"), where("isPublic", "==", true))));
    await assertSucceeds(getDoc(doc(as("extraño"), "stores/s1/products/p1")));
  });

  it("editar la tienda requiere permiso y no permite cambiar dueño ni estado del sistema", async () => {
    await seedStore(env);
    await assertSucceeds(updateDoc(doc(as("owner"), "stores/s1"), { address: "Av. Nueva 1" }));
    await assertFails(updateDoc(doc(as("emp"), "stores/s1"), { address: "Av. Nueva 1" }));
    await assertFails(updateDoc(doc(as("owner"), "stores/s1"), { ownerId: "otro" }));
    await assertFails(updateDoc(doc(as("owner"), "stores/s1"), { disabledBySystem: true }));
  });

  it("consulta collection group: mis membresías", async () => {
    await seedStore(env);
    await assertSucceeds(getDocs(query(collectionGroup(as("emp"), "members"), where("uid", "==", "emp"))));
    await assertFails(getDocs(collectionGroup(as("emp"), "members")));
  });
});

describe("miembros e invitaciones", () => {
  beforeEach(() => seedStore(env));

  it("el dueño habilita/deshabilita y da permisos a empleados", async () => {
    await assertSucceeds(updateDoc(doc(as("owner"), "stores/s1/members/emp"), { active: false }));
    await assertSucceeds(updateDoc(doc(as("owner"), "stores/s1/members/emp"), { permissions: ["reports"] }));
  });

  it("nadie modifica al dueño, a sí mismo, ni da permisos a clientes", async () => {
    await assertFails(updateDoc(doc(as("boss"), "stores/s1/members/owner"), { active: false }));
    await assertFails(updateDoc(doc(as("boss"), "stores/s1/members/boss"), { permissions: ["edit_store"] }));
    await assertFails(updateDoc(doc(as("owner"), "stores/s1/members/cli"), { permissions: ["reports"] }));
    await assertFails(updateDoc(doc(as("emp"), "stores/s1/members/cli"), { active: false }));
    await assertFails(updateDoc(doc(as("owner"), "stores/s1/members/emp"), { role: "owner" }));
  });

  it("invitar requiere el permiso de miembros y el invitado puede leerla", async () => {
    const invitation = {
      storeId: "s1", storeName: "Bodega Rosita", storePhotoPath: null, fromUid: "boss", fromName: "Jefe",
      toUid: "nuevo", toName: "Nuevo", toCode: "5555555555", role: "employee", status: "pending",
    };
    await assertSucceeds(setDoc(doc(as("boss"), "stores/s1/invitations/i1"), invitation));
    await assertFails(setDoc(doc(as("emp"), "stores/s1/invitations/i2"), { ...invitation, fromUid: "emp" }));
    await assertFails(setDoc(doc(as("boss"), "stores/s1/invitations/i3"), { ...invitation, status: "accepted" }));
    await assertFails(setDoc(doc(as("boss"), "stores/s1/invitations/i4"), { ...invitation, role: "owner" }));
    await assertSucceeds(getDoc(doc(as("nuevo"), "stores/s1/invitations/i1")));
    // El invitado no puede aceptarla escribiendo directamente (lo hace la función respondInvitation).
    await assertFails(updateDoc(doc(as("nuevo"), "stores/s1/invitations/i1"), { status: "accepted" }));
    await assertSucceeds(updateDoc(doc(as("owner"), "stores/s1/invitations/i1"), { status: "cancelled" }));
  });
});

describe("catálogo", () => {
  beforeEach(() => seedStore(env));

  it("solo quien tiene permiso crea productos", async () => {
    await assertSucceeds(setDoc(doc(as("boss"), "stores/s1/products/p2"), productData()));
    await assertFails(setDoc(doc(as("emp"), "stores/s1/products/p2"), productData()));
    await assertFails(setDoc(doc(as("off"), "stores/s1/products/p2"), productData()));
    await assertFails(setDoc(doc(as("cli"), "stores/s1/products/p2"), productData()));
  });

  it("el precio de venta es obligatorio y la alerta debe ser mayor a 0", async () => {
    await assertFails(setDoc(doc(as("owner"), "stores/s1/products/p2"), productData({ salePriceCents: null })));
    await assertFails(setDoc(doc(as("owner"), "stores/s1/products/p2"), productData({ salePriceCents: 4.5 })));
    await assertFails(setDoc(doc(as("owner"), "stores/s1/products/p2"), productData({ stockAlert: 0 })));
    await assertSucceeds(setDoc(doc(as("owner"), "stores/s1/products/p2"), productData({ stock: null })));
  });

  it("con permiso de categorías solo se cambia la categoría del producto", async () => {
    await assertSucceeds(updateDoc(doc(as("cats"), "stores/s1/products/p1"), { categoryId: "c1" }));
    await assertFails(updateDoc(doc(as("cats"), "stores/s1/products/p1"), { salePriceCents: 1 }));
  });

  it("una tienda deshabilitada por el sistema no acepta cambios", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "stores/s1"), { disabledBySystem: true }));
    await assertFails(setDoc(doc(as("owner"), "stores/s1/products/p9"), productData()));
  });
});

describe("ventas", () => {
  beforeEach(() => seedStore(env));

  it("empleados y dueño crean órdenes sin número; clientes no", async () => {
    await assertSucceeds(setDoc(doc(as("emp"), "stores/s1/orders/o1"), orderData("emp")));
    await assertSucceeds(setDoc(doc(as("owner"), "stores/s1/orders/o2"), orderData("owner")));
    await assertFails(setDoc(doc(as("cli"), "stores/s1/orders/o3"), orderData("cli")));
    await assertFails(setDoc(doc(as("emp"), "stores/s1/orders/o4"), orderData("emp", { number: 5 })));
    await assertFails(setDoc(doc(as("emp"), "stores/s1/orders/o5"), orderData("owner")));
    await assertFails(setDoc(doc(as("emp"), "stores/s1/orders/o6"), orderData("emp", { items: [] })));
  });

  it("cada empleado ve sus ventas; con permiso de reportes ve todas", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "stores/s1/orders/o1"), orderData("emp"));
      await setDoc(doc(ctx.firestore(), "stores/s1/orders/o2"), orderData("boss"));
    });
    await assertSucceeds(getDocs(query(collection(as("emp"), "stores/s1/orders"), where("createdBy", "==", "emp"))));
    await assertFails(getDocs(collection(as("emp"), "stores/s1/orders")));
    await assertSucceeds(getDocs(collection(as("boss"), "stores/s1/orders")));
    await assertFails(updateDoc(doc(as("emp"), "stores/s1/orders/o1"), { totalCents: 1 }));
  });
});
