import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { buildUsageReport } from "../application/usage";
import { isEmulator } from "../infrastructure/firebase";
import { respondInvitation as respond } from "../infrastructure/invitations";
import { FcmPushSender, FirestoreNotificationWriter } from "../infrastructure/notifications";
import { CloudMonitoringUsageSource, EmulatorUsageSource } from "../infrastructure/usageSources";
import { bootstrapUser as bootstrap, deleteAccount as removeAccount, setStoreDisabled, setUserDisabled } from "../infrastructure/users";

const notifications = new FirestoreNotificationWriter();
const push = new FcmPushSender();

function requireAuth(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  return request.auth.uid;
}

function requireSuperadmin(request: CallableRequest): string {
  const uid = requireAuth(request);
  if (request.auth?.token.superadmin !== true) {
    throw new HttpsError("permission-denied", "Solo el superadministrador puede usar esta opción.");
  }
  return uid;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new HttpsError("invalid-argument", `Falta el campo ${field}.`);
  }
  return value;
}

/** Crea el perfil y el código de 10 dígitos del usuario la primera vez que inicia sesión. */
export const bootstrapUser = onCall(async (request) => {
  const uid = requireAuth(request);
  return bootstrap(uid, {
    email: request.auth?.token.email ?? null,
    name: (request.data?.displayName as string | undefined) ?? (request.auth?.token.name as string | undefined) ?? null,
    superadmin: request.auth?.token.superadmin === true,
  });
});

export const deleteAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  if (request.auth?.token.superadmin === true) {
    throw new HttpsError("failed-precondition", "La cuenta del superadministrador no se puede eliminar desde la app.");
  }
  await removeAccount(uid);
  return { ok: true };
});

export const respondInvitation = onCall(async (request) => {
  const uid = requireAuth(request);
  const storeId = requireString(request.data?.storeId, "storeId");
  const invitationId = requireString(request.data?.invitationId, "invitationId");
  const accept = request.data?.accept === true;
  return respond(uid, storeId, invitationId, accept, notifications, push);
});

// ---------------------------------------------------------------- opciones maestras

export const adminGetUsage = onCall(async (request) => {
  requireSuperadmin(request);
  const source = isEmulator ? new EmulatorUsageSource() : new CloudMonitoringUsageSource();
  return buildUsageReport(source, new Date());
});

export const adminSetUserDisabled = onCall(async (request) => {
  const caller = requireSuperadmin(request);
  const uid = requireString(request.data?.uid, "uid");
  if (uid === caller) throw new HttpsError("failed-precondition", "No puedes deshabilitar tu propia cuenta.");
  await setUserDisabled(uid, request.data?.disabled === true);
  return { ok: true };
});

export const adminSetStoreDisabled = onCall(async (request) => {
  requireSuperadmin(request);
  const storeId = requireString(request.data?.storeId, "storeId");
  await setStoreDisabled(storeId, request.data?.disabled === true);
  return { ok: true };
});
