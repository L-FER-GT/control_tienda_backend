import type { QuotaDefinition } from "../domain/quotas";

/*
 * Puertos de la capa de aplicación. Las implementaciones viven en infrastructure/
 * y las pruebas usan dobles en memoria.
 */

export interface UsageSource {
  readonly name: "monitoring" | "emulator";
  /** Consumo del recurso en la ventana de su cuota (día, mes o acumulado). */
  read(quota: QuotaDefinition, now: Date): Promise<number>;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushSender {
  sendToUser(uid: string, payload: PushPayload): Promise<void>;
}

export interface NewNotification {
  type: "invitation" | "invitation_response" | "usage_alert" | "info";
  title: string;
  body: string;
  fromUid?: string | null;
  fromName?: string | null;
  fromPhotoPath?: string | null;
  invitationId?: string | null;
  invitationStatus?: string | null;
  storeId?: string | null;
}

export interface NotificationWriter {
  /** Si se indica [id], la operación es idempotente. */
  create(uid: string, notification: NewNotification, id?: string): Promise<void>;
}

export interface UsageAlertLog {
  wasNotified(key: string): Promise<boolean>;
  markNotified(key: string): Promise<void>;
}

export interface SuperadminDirectory {
  listSuperadminIds(): Promise<string[]>;
}
