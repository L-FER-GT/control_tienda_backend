import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { generateUserCode } from "../domain/userCode";
import { auth, bucket, db } from "./firebase";

export interface UserProfileDto {
  uid: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  photoPath: string | null;
  code: string;
  isSuperadmin: boolean;
  disabled: boolean;
}

export function cleanName(raw: unknown, fallback = "Usuario"): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return (name.length > 0 ? name : fallback).slice(0, 80);
}

function toDto(uid: string, data: DocumentData): UserProfileDto {
  return {
    uid,
    displayName: data.displayName ?? "Usuario",
    email: data.email ?? null,
    phone: data.phone ?? null,
    photoPath: data.photoPath ?? null,
    code: data.code,
    isSuperadmin: data.isSuperadmin === true,
    disabled: data.disabled === true,
  };
}

/**
 * Crea (una sola vez) el perfil del usuario con su código único de 10 dígitos:
 *   users/{uid}            perfil privado
 *   publicProfiles/{uid}   nombre, foto y código (para buscarlo e invitarlo)
 *   userCodes/{code}       índice código -> uid (garantiza unicidad)
 */
export async function bootstrapUser(
  uid: string,
  info: { email?: string | null; name?: string | null; superadmin?: boolean },
): Promise<UserProfileDto> {
  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  if (existing.exists) return toDto(uid, existing.data()!);

  const displayName = cleanName(info.name, info.email?.split("@")[0] ?? "Usuario");
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateUserCode();
    const result = await db.runTransaction(async (tx) => {
      const again = await tx.get(userRef);
      if (again.exists) return toDto(uid, again.data()!);
      const codeRef = db.doc(`userCodes/${code}`);
      if ((await tx.get(codeRef)).exists) return null; // colisión: se reintenta con otro código

      const now = FieldValue.serverTimestamp();
      const profile = {
        displayName,
        email: info.email ?? null,
        phone: null,
        photoPath: null,
        code,
        isSuperadmin: info.superadmin === true,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.set(userRef, profile);
      tx.set(db.doc(`publicProfiles/${uid}`), {
        displayName,
        displayNameLower: displayName.toLowerCase(),
        photoPath: null,
        code,
        disabled: false,
        updatedAt: now,
      });
      tx.set(codeRef, { uid, createdAt: now });
      return toDto(uid, profile);
    });
    if (result) return result;
  }
  throw new HttpsError("internal", "No se pudo generar un código de usuario único. Intenta de nuevo.");
}

/**
 * Elimina la cuenta (requisito de Google Play):
 *  - Las tiendas propias quedan privadas y deshabilitadas (los datos históricos se conservan).
 *  - Se eliminan membresías, perfil, código, notificaciones, dispositivos y avatar.
 */
export async function deleteAccount(uid: string): Promise<void> {
  const now = FieldValue.serverTimestamp();
  const owned = await db.collection("stores").where("ownerId", "==", uid).get();
  const memberships = await db.collectionGroup("members").where("uid", "==", uid).get();
  const user = await db.doc(`users/${uid}`).get();

  const writer = db.bulkWriter();
  owned.docs.forEach((d) => writer.update(d.ref, { isPublic: false, disabledBySystem: true, deletedAt: now }));
  memberships.docs.forEach((d) => writer.delete(d.ref));
  writer.delete(db.doc(`publicProfiles/${uid}`));
  const code = user.get("code");
  if (typeof code === "string") writer.delete(db.doc(`userCodes/${code}`));
  await writer.close();

  await db.recursiveDelete(db.doc(`users/${uid}`));
  await bucket().deleteFiles({ prefix: `users/${uid}/` }).catch(() => undefined);
  await auth.deleteUser(uid);
}

/** Mantiene nombre y foto de las membresías al día cuando el usuario edita su perfil. */
export async function syncMemberships(uid: string, displayName: string, photoPath: string | null): Promise<void> {
  const memberships = await db.collectionGroup("members").where("uid", "==", uid).get();
  if (memberships.empty) return;
  const writer = db.bulkWriter();
  memberships.docs.forEach((d) => writer.update(d.ref, { displayName, photoPath }));
  await writer.close();
}

export async function setUserDisabled(uid: string, disabled: boolean): Promise<void> {
  await auth.updateUser(uid, { disabled });
  if (disabled) await auth.revokeRefreshTokens(uid);
  const batch = db.batch();
  batch.set(db.doc(`users/${uid}`), { disabled, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.doc(`publicProfiles/${uid}`), { disabled }, { merge: true });
  await batch.commit();
}

export async function setStoreDisabled(storeId: string, disabled: boolean): Promise<void> {
  const ref = db.doc(`stores/${storeId}`);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "La tienda no existe");
  await ref.update({ disabledBySystem: disabled, updatedAt: FieldValue.serverTimestamp() });
}
