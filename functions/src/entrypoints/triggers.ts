import { logger } from "firebase-functions";
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { removedFiles } from "../domain/files";
import { bucket } from "../infrastructure/firebase";
import { processOrder, processReception } from "../infrastructure/inventory";
import { markInvitationCancelled, notifyInvitation } from "../infrastructure/invitations";
import { FcmPushSender, FirestoreNotificationWriter } from "../infrastructure/notifications";
import { syncMemberships } from "../infrastructure/users";

const notifications = new FirestoreNotificationWriter();
const push = new FcmPushSender();

// ---------------------------------------------------------------- invitaciones

export const onInvitationCreated = onDocumentCreated("stores/{storeId}/invitations/{invitationId}", async (event) => {
  const data = event.data?.data();
  if (!data || data.status !== "pending") return;
  await notifyInvitation(event.params.storeId, event.params.invitationId, data, notifications, push);
});

export const onInvitationUpdated = onDocumentUpdated("stores/{storeId}/invitations/{invitationId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (before?.status === "pending" && after?.status === "cancelled") {
    await markInvitationCancelled(after, event.params.invitationId);
  }
});

// ---------------------------------------------------------------- inventario

/** Número correlativo + descuento de stock al sincronizar una venta creada (incluso sin conexión). */
export const onOrderCreated = onDocumentCreated("stores/{storeId}/orders/{orderId}", async (event) => {
  const number = await processOrder(event.params.storeId, event.params.orderId);
  logger.info(`Orden ${event.params.orderId} -> N° ${number}`);
});

/** Stock y costos de una recepción (creación, edición o borrado) + limpieza de fotos de facturas. */
export const onReceptionWritten = onDocumentWritten("stores/{storeId}/receptions/{receptionId}", async (event) => {
  await processReception(event.params.storeId, event.params.receptionId);
  await deleteFiles(removedFiles(event.data?.before.data(), event.data?.after.data(), ["invoicePhotos"]));
});

// ---------------------------------------------------------------- perfiles

export const onPublicProfileUpdated = onDocumentUpdated("publicProfiles/{uid}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || (before?.displayName === after.displayName && before?.photoPath === after.photoPath)) return;
  await syncMemberships(event.params.uid, after.displayName, after.photoPath ?? null);
});

// ---------------------------------------------------------------- limpieza de archivos reemplazados

async function deleteFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map((path) =>
      bucket()
        .file(path)
        .delete({ ignoreNotFound: true })
        .catch((error) => logger.warn(`No se pudo borrar ${path}`, error)),
    ),
  );
}

export const cleanupStoreFiles = onDocumentWritten("stores/{storeId}", (event) =>
  deleteFiles(removedFiles(event.data?.before.data(), event.data?.after.data(), ["photoPath"])),
);

export const cleanupCategoryFiles = onDocumentWritten("stores/{storeId}/categories/{categoryId}", (event) =>
  deleteFiles(removedFiles(event.data?.before.data(), event.data?.after.data(), ["photoPath"])),
);

export const cleanupProductFiles = onDocumentWritten("stores/{storeId}/products/{productId}", (event) =>
  deleteFiles(removedFiles(event.data?.before.data(), event.data?.after.data(), ["photoPath"])),
);

export const cleanupUserFiles = onDocumentWritten("users/{userId}", (event) =>
  deleteFiles(removedFiles(event.data?.before.data(), event.data?.after.data(), ["photoPath"])),
);
