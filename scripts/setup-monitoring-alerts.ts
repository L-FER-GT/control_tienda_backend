/**
 * Crea en Cloud Monitoring las alertas por correo al 80 % de las cuotas gratuitas.
 *   npm run monitoring:setup
 *
 * Requiere en .env: FIREBASE_PROJECT_ID, ALERT_EMAIL y GOOGLE_APPLICATION_CREDENTIALS
 * (la cuenta de servicio necesita el rol "Monitoring AlertPolicy Editor" y
 * "Monitoring NotificationChannel Editor"). Es idempotente: recrea las políticas con el mismo nombre.
 *
 * Cloud Monitoring evalúa ventanas móviles de hasta 24 h, así que las cuotas mensuales se vigilan
 * con su equivalente diario (cuota mensual * 0.8 / 30). La función usageWatchdog además revisa el
 * acumulado del mes cada 6 horas y avisa dentro de la app. Ver docs/03-plan-blaze-cuotas-y-alertas.md
 */
import { config } from "dotenv";
import { AlertPolicyServiceClient, NotificationChannelServiceClient } from "@google-cloud/monitoring";

config({ quiet: true });

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const alertEmail = process.env.ALERT_EMAIL?.trim();
if (!projectId || !alertEmail) {
  console.error("Completa FIREBASE_PROJECT_ID y ALERT_EMAIL en el archivo .env (ver .env.example).");
  process.exit(1);
}

const PREFIX = "[Control Tienda]";
const DAY = 86_400;
const GIB = 1024 ** 3;

interface AlertDefinition {
  name: string;
  filter: string;
  threshold: number;
  aligner: "ALIGN_SUM" | "ALIGN_MAX";
  description: string;
}

const ALERTS: AlertDefinition[] = [
  {
    name: "Lecturas Firestore >= 40 000 / día (80 %)",
    filter: 'metric.type="firestore.googleapis.com/document/read_count" AND resource.type="firestore_instance"',
    threshold: 40_000,
    aligner: "ALIGN_SUM",
    description: "Cuota gratuita: 50 000 lecturas por día.",
  },
  {
    name: "Escrituras Firestore >= 16 000 / día (80 %)",
    filter: 'metric.type="firestore.googleapis.com/document/write_count" AND resource.type="firestore_instance"',
    threshold: 16_000,
    aligner: "ALIGN_SUM",
    description: "Cuota gratuita: 20 000 escrituras por día.",
  },
  {
    name: "Borrados Firestore >= 16 000 / día (80 %)",
    filter: 'metric.type="firestore.googleapis.com/document/delete_count" AND resource.type="firestore_instance"',
    threshold: 16_000,
    aligner: "ALIGN_SUM",
    description: "Cuota gratuita: 20 000 borrados por día.",
  },
  {
    name: "Fotos guardadas >= 4 GB (80 %)",
    filter: 'metric.type="storage.googleapis.com/storage/total_bytes" AND resource.type="gcs_bucket"',
    threshold: 4 * GIB,
    aligner: "ALIGN_MAX",
    description: "Cuota gratuita: 5 GB almacenados (bucket en us-east1, us-central1 o us-west1).",
  },
  {
    name: "Descarga de fotos >= 2.67 GB / día (80 GB al mes)",
    filter: 'metric.type="storage.googleapis.com/network/sent_bytes_count" AND resource.type="gcs_bucket"',
    threshold: Math.round((80 * GIB) / 30),
    aligner: "ALIGN_SUM",
    description: "Cuota gratuita: 100 GB de descarga por mes.",
  },
  {
    name: "Ejecuciones de funciones >= 53 333 / día (80 % de 2 M al mes)",
    filter: 'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"',
    threshold: Math.round((2_000_000 * 0.8) / 30),
    aligner: "ALIGN_SUM",
    description: "Cuota gratuita: 2 millones de invocaciones por mes.",
  },
];

const channels = new NotificationChannelServiceClient();
const policies = new AlertPolicyServiceClient();
const projectName = `projects/${projectId}`;

const [existingChannels] = await channels.listNotificationChannels({ name: projectName });
let channel = existingChannels.find((c) => c.type === "email" && c.labels?.email_address === alertEmail);
if (!channel) {
  [channel] = await channels.createNotificationChannel({
    name: projectName,
    notificationChannel: { type: "email", displayName: `${PREFIX} ${alertEmail}`, labels: { email_address: alertEmail } },
  });
  console.log(`Canal de correo creado: ${alertEmail}`);
}

const [existingPolicies] = await policies.listAlertPolicies({ name: projectName });
let ok = 0;
for (const alert of ALERTS) {
  const displayName = `${PREFIX} ${alert.name}`;
  for (const old of existingPolicies.filter((p) => p.displayName === displayName)) {
    await policies.deleteAlertPolicy({ name: old.name! });
  }
  try {
    await policies.createAlertPolicy({
      name: projectName,
      alertPolicy: {
        displayName,
        combiner: "OR",
        conditions: [
          {
            displayName: alert.name,
            conditionThreshold: {
              filter: alert.filter,
              comparison: "COMPARISON_GT",
              thresholdValue: alert.threshold,
              duration: { seconds: 0 },
              trigger: { count: 1 },
              aggregations: [
                { alignmentPeriod: { seconds: DAY }, perSeriesAligner: alert.aligner, crossSeriesReducer: "REDUCE_SUM" },
              ],
            },
          },
        ],
        notificationChannels: [channel.name!],
        alertStrategy: { autoClose: { seconds: 7 * DAY } },
        documentation: {
          mimeType: "text/markdown",
          content: `${alert.description}\n\nRevisa el consumo en la app: Avatar > Opciones maestras > Consumo.`,
        },
      },
    });
    ok++;
    console.log(`✔ ${displayName}`);
  } catch (error) {
    console.error(`✖ ${displayName}: ${(error as Error).message}`);
  }
}
console.log(`${ok}/${ALERTS.length} alertas configuradas en ${projectId}.`);
console.log("Recuerda crear también un presupuesto en Facturación (ver docs/03-plan-blaze-cuotas-y-alertas.md).");
