import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

const app = getApps()[0] ?? initializeApp();

export const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

export const auth = getAuth(app);
export const messaging = getMessaging(app);
export const bucket = () => getStorage(app).bucket();

export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

export function projectId(): string {
  return process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? app.options.projectId ?? "";
}
