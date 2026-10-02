import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createEnv, seedStore } from "./helpers";

let env: RulesTestEnvironment;
const storageAs = (uid: string) => env.authenticatedContext(uid).storage();

const image = (bytes: number) => new Uint8Array(bytes);
const jpeg = { contentType: "image/jpeg" };
const MB = 1024 * 1024;

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seedStore(env);
});

describe("carpeta del servidor (Cloud Storage)", () => {
  it("límite de 5 MB por archivo", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("owner"), "stores/s1/products/a.jpg"), image(MB), jpeg));
    await assertFails(uploadBytes(ref(storageAs("owner"), "stores/s1/products/b.jpg"), image(5 * MB + 1), jpeg));
  });

  it("subir fotos de productos requiere permiso en la tienda", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("boss"), "stores/s1/products/c.jpg"), image(100), jpeg));
    await assertFails(uploadBytes(ref(storageAs("emp"), "stores/s1/products/d.jpg"), image(100), jpeg));
    await assertFails(uploadBytes(ref(storageAs("off"), "stores/s1/products/e.jpg"), image(100), jpeg));
    await assertFails(uploadBytes(ref(storageAs("boss"), "stores/s1/store/f.jpg"), image(100), jpeg));
  });

  it("facturas en PDF permitidas, ejecutables no", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageAs("owner"), "stores/s1/receptions/f.pdf"), image(100), { contentType: "application/pdf" }),
    );
    await assertFails(
      uploadBytes(ref(storageAs("owner"), "stores/s1/receptions/x.exe"), image(100), {
        contentType: "application/octet-stream",
      }),
    );
  });

  it("cada usuario sube solo su avatar", async () => {
    await assertSucceeds(uploadBytes(ref(storageAs("ana"), "users/ana/avatar.jpg"), image(100), jpeg));
    await assertFails(uploadBytes(ref(storageAs("ana"), "users/luis/avatar.jpg"), image(100), jpeg));
  });
});
