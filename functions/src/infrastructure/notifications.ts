import { logger } from "firebase-functions";
import { FieldValue } from "firebase-admin/firestore";
import type {
  NewNotification,
  NotificationWriter,
  PushPayload,
  PushSender,
  SuperadminDirectory,
  UsageAlertLog,
} from "../application/ports";
import { db, isEmulator, messaging } from "./firebase";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Notificaciones push con FCM a todos los dispositivos del usuario. */
export class FcmPushSender implements PushSender {
  async sendToUser(uid: string, payload: PushPayload): Promise<void> {
    if (isEmulator) {
      logger.info(`[emulador] push a ${uid}: ${payload.title}`);
      return;
    }
    const devices = await db.collection(`users/${uid}/devices`).get();
    if (devices.empty) return;
    const tokens = devices.docs.map((d) => d.id);
    try {
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: "high", notification: { channelId: "general" } },
      });
      await Promise.all(
        result.responses.map((response, index) =>
          !response.success && INVALID_TOKEN_CODES.has(response.error?.code ?? "")
            ? devices.docs[index].ref.delete()
            : Promise.resolve(),
        ),
      );
    } catch (error) {
      logger.warn("No se pudo enviar la notificación push", error);
    }
  }
}

/** Notificaciones dentro de la app: users/{uid}/notifications/{id}. */
export class FirestoreNotificationWriter implements NotificationWriter {
  async create(uid: string, n: NewNotification, id?: string): Promise<void> {
    const collection = db.collection(`users/${uid}/notifications`);
    const ref = id ? collection.doc(id) : collection.doc();
    await ref.set({
      type: n.type,
      title: n.title,
      body: n.body,
      fromUid: n.fromUid ?? null,
      fromName: n.fromName ?? null,
      fromPhotoPath: n.fromPhotoPath ?? null,
      invitationId: n.invitationId ?? null,
      invitationStatus: n.invitationStatus ?? null,
      storeId: n.storeId ?? null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

export class FirestoreUsageAlertLog implements UsageAlertLog {
  private readonly ref = db.doc("system/usageAlerts");

  async wasNotified(key: string): Promise<boolean> {
    const snap = await this.ref.get();
    return Boolean(snap.get(`sent.${key}`));
  }

  async markNotified(key: string): Promise<void> {
    await this.ref.set({ sent: { [key]: FieldValue.serverTimestamp() } }, { merge: true });
  }
}

export class FirestoreSuperadminDirectory implements SuperadminDirectory {
  async listSuperadminIds(): Promise<string[]> {
    const snap = await db.collection("users").where("isSuperadmin", "==", true).get();
    return snap.docs.map((d) => d.id);
  }
}
