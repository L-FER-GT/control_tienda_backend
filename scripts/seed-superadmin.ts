/**
 * Crea o actualiza el usuario superadmin (creador de la app) a partir del archivo .env:
 *   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME
 *
 *   npm run superadmin:seed            -> proyecto real (usa GOOGLE_APPLICATION_CREDENTIALS)
 *   npm run superadmin:seed:emulator   -> Firebase Emulator Suite
 *
 * Solo puede existir un superadmin: si había otro, se le retira el privilegio.
 * Ver docs/04-superadmin.md
 */
import { config } from "dotenv";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { generateUserCode } from "../functions/src/domain/userCode";

config({ quiet: true });

const useEmulator = process.argv.includes("--emulator");
if (useEmulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Falta la variable ${name} en el archivo .env (ver .env.example).`);
    process.exit(1);
  }
  return value;
}

const projectId = useEmulator ? "demo-control-tienda" : required("FIREBASE_PROJECT_ID");
const email = required("SUPERADMIN_EMAIL").toLowerCase();
const password = required("SUPERADMIN_PASSWORD");
const displayName = process.env.SUPERADMIN_NAME?.trim() || "Administrador del sistema";

if (!useEmulator && password.length < 12) {
  console.error("Por seguridad, SUPERADMIN_PASSWORD debe tener al menos 12 caracteres.");
  process.exit(1);
}

initializeApp(useEmulator ? { projectId } : { projectId, credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

async function upsertAuthUser(): Promise<UserRecord> {
  try {
    const existing = await auth.getUserByEmail(email);
    return auth.updateUser(existing.uid, { password, displayName, emailVerified: true, disabled: false });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    return auth.createUser({ email, password, displayName, emailVerified: true });
  }
}

async function ensureProfile(uid: string): Promise<string> {
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  if (snap.exists) {
    await userRef.update({ isSuperadmin: true, disabled: false, updatedAt: FieldValue.serverTimestamp() });
    return snap.get("code");
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateUserCode();
    const created = await db.runTransaction(async (tx) => {
      const codeRef = db.doc(`userCodes/${code}`);
      if ((await tx.get(codeRef)).exists) return false;
      const now = FieldValue.serverTimestamp();
      tx.set(userRef, {
        displayName, email, phone: null, photoPath: null, code,
        isSuperadmin: true, disabled: false, createdAt: now, updatedAt: now,
      });
      tx.set(db.doc(`publicProfiles/${uid}`), {
        displayName, displayNameLower: displayName.toLowerCase(), photoPath: null, code, disabled: false, updatedAt: now,
      });
      tx.set(codeRef, { uid, createdAt: now });
      return true;
    });
    if (created) return code;
  }
  throw new Error("No se pudo generar un código único");
}

async function revokeOtherSuperadmins(keepUid: string): Promise<void> {
  const others = await db.collection("users").where("isSuperadmin", "==", true).get();
  for (const doc of others.docs) {
    if (doc.id === keepUid) continue;
    const user = await auth.getUser(doc.id).catch(() => null);
    if (user) {
      const { superadmin: _removed, ...claims } = user.customClaims ?? {};
      await auth.setCustomUserClaims(doc.id, claims);
    }
    await doc.ref.update({ isSuperadmin: false });
    console.log(`Se retiró el privilegio de superadmin a ${doc.get("email") ?? doc.id}`);
  }
}

const user = await upsertAuthUser();
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), superadmin: true });
const code = await ensureProfile(user.uid);
await revokeOtherSuperadmins(user.uid);

console.log(`Superadmin listo en ${useEmulator ? "el emulador" : projectId}`);
console.log(`  Correo: ${email}`);
console.log(`  UID:    ${user.uid}`);
console.log(`  Código: ${code}`);
console.log("Si ya tenías la sesión abierta en la app, cierra sesión y vuelve a entrar para ver las opciones maestras.");
