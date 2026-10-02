import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { NotificationWriter, PushSender } from "../application/ports";
import { invitationResponseText, invitationText, type InvitationRole } from "../domain/messages";
import { db } from "./firebase";

/** Al crear una invitación: notificación dentro de la app (id = id de la invitación) + push. */
export async function notifyInvitation(
  storeId: string,
  invitationId: string,
  invitation: DocumentData,
  notifications: NotificationWriter,
  push: PushSender,
): Promise<void> {
  const from = await db.doc(`publicProfiles/${invitation.fromUid}`).get();
  const fromName: string = from.get("displayName") ?? invitation.fromName ?? "Alguien";
  const text = invitationText(fromName, invitation.storeName ?? "una tienda", invitation.role as InvitationRole);
  await notifications.create(
    invitation.toUid,
    {
      type: "invitation",
      ...text,
      fromUid: invitation.fromUid,
      fromName,
      fromPhotoPath: from.get("photoPath") ?? null,
      invitationId,
      invitationStatus: "pending",
      storeId,
    },
    invitationId,
  );
  await push.sendToUser(invitation.toUid, {
    ...text,
    data: { type: "invitation", storeId, invitationId },
  });
}

/** Si el administrador cancela la invitación, la notificación del invitado lo refleja. */
export async function markInvitationCancelled(invitation: DocumentData, invitationId: string): Promise<void> {
  await db
    .doc(`users/${invitation.toUid}/notifications/${invitationId}`)
    .set({ invitationStatus: "cancelled" }, { merge: true });
}

/**
 * El invitado acepta o rechaza. Al aceptar se crea (o reactiva) su membresía en la tienda.
 * Todo ocurre en una transacción para no aceptar dos veces ni aceptar invitaciones canceladas.
 */
export async function respondInvitation(
  callerUid: string,
  storeId: string,
  invitationId: string,
  accept: boolean,
  notifications: NotificationWriter,
  push: PushSender,
): Promise<{ status: "accepted" | "rejected" }> {
  const invitationRef = db.doc(`stores/${storeId}/invitations/${invitationId}`);
  const storeRef = db.doc(`stores/${storeId}`);
  const memberRef = db.doc(`stores/${storeId}/members/${callerUid}`);
  const profileRef = db.doc(`publicProfiles/${callerUid}`);
  const status = accept ? "accepted" : "rejected";

  const invitation = await db.runTransaction(async (tx) => {
    const [invSnap, storeSnap, memberSnap, profileSnap] = await tx.getAll(invitationRef, storeRef, memberRef, profileRef);
    if (!invSnap.exists) throw new HttpsError("not-found", "La invitación ya no existe.");
    const inv = invSnap.data()!;
    if (inv.toUid !== callerUid) throw new HttpsError("permission-denied", "Esta invitación no es para ti.");
    if (inv.status === "cancelled") throw new HttpsError("failed-precondition", "El administrador canceló esta invitación.");
    if (inv.status !== "pending") throw new HttpsError("failed-precondition", "Ya respondiste esta invitación.");
    if (!storeSnap.exists || storeSnap.get("disabledBySystem") === true) {
      throw new HttpsError("failed-precondition", "La tienda ya no está disponible.");
    }

    const now = FieldValue.serverTimestamp();
    if (accept) {
      const previous = memberSnap.exists ? memberSnap.data()! : null;
      if (previous?.role === "owner") throw new HttpsError("failed-precondition", "Ya eres el administrador de esta tienda.");
      const keepPermissions = previous?.role === "employee" && inv.role === "employee";
      tx.set(memberRef, {
        uid: callerUid,
        role: inv.role,
        permissions: keepPermissions ? previous?.permissions ?? [] : [],
        active: true,
        displayName: profileSnap.get("displayName") ?? inv.toName ?? "Usuario",
        photoPath: profileSnap.get("photoPath") ?? null,
        code: profileSnap.get("code") ?? "",
        joinedAt: previous?.joinedAt ?? now,
        updatedAt: now,
      });
    }
    tx.update(invitationRef, { status, respondedAt: now });
    tx.set(
      db.doc(`users/${callerUid}/notifications/${invitationId}`),
      { invitationStatus: status, read: true },
      { merge: true },
    );
    return {
      fromUid: inv.fromUid as string,
      storeName: (inv.storeName as string | undefined) ?? null,
      toName: (profileSnap.get("displayName") as string | undefined) ?? (inv.toName as string | undefined) ?? null,
    };
  });

  const text = invitationResponseText(invitation.toName ?? "El usuario", invitation.storeName ?? "tu tienda", accept);
  await notifications.create(
    invitation.fromUid,
    { type: "invitation_response", ...text, fromUid: callerUid, fromName: invitation.toName, storeId },
    `response_${invitationId}`,
  );
  await push.sendToUser(invitation.fromUid, { ...text, data: { type: "invitation_response", storeId } });
  return { status };
}
