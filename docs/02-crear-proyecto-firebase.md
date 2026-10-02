# 2. Crear y configurar el proyecto de Firebase

> Todo se hace una sola vez. Toma unos 20 minutos.

## 1. Crear el proyecto

1. Entra a [Firebase Console](https://console.firebase.google.com) → **Agregar proyecto**.
2. Nombre: `control-tienda` (el **ID del proyecto** que se genere es el que usarás en todas partes).
3. Google Analytics: opcional (no lo usa la app).

## 2. Activar el plan Blaze

Cloud Functions, Cloud Storage y Cloud Scheduler lo requieren.

1. Engranaje ⚙️ → **Uso y facturación** → **Detalles y configuración** → **Modificar plan** → **Blaze**.
2. Vincula una cuenta de facturación (tarjeta).
3. **Inmediatamente después**, crea el presupuesto y las alertas de
   [03-plan-blaze-cuotas-y-alertas.md](03-plan-blaze-cuotas-y-alertas.md).

## 3. Firestore

**Compilación → Firestore Database → Crear base de datos**:

- Edición **Standard**, ID `(default)`.
- Ubicación **`us-east1`** (Carolina del Sur). Debe coincidir con la región de las funciones.
  ⚠️ La ubicación no se puede cambiar después.
- Modo **producción** (las reglas reales se despliegan desde este repo).

## 4. Storage

**Compilación → Storage → Comenzar**:

- Ubicación **`us-east1`** (o `us-central1` / `us-west1`). Solo esas regiones tienen el nivel sin costo de Cloud Storage.
- Modo producción.

## 5. Authentication

**Compilación → Authentication → Comenzar → Método de inicio de sesión**:

- **Correo electrónico/contraseña:** habilitar.
- **Google:** habilitar y elegir el correo de asistencia.
- Opcional: **Plantillas** → cambia el idioma a español para los correos de recuperación de contraseña.

## 6. Conectar este repositorio

```bash
npm install -g firebase-tools   # si no lo tienes
firebase login                  # abre el navegador
```

Edita [`.firebaserc`](../.firebaserc) y reemplaza `REEMPLAZAR-CON-TU-PROJECT-ID` por tu ID:

```json
{ "projects": { "default": "demo-control-tienda", "prod": "control-tienda-xxxxx" } }
```

`default` sigue apuntando al proyecto demo para que nadie despliegue a producción por error.

## 7. Primer despliegue

```bash
npm install
npm run deploy           # firebase deploy --project prod
```

La primera vez Firebase activa las APIs necesarias (Cloud Functions, Cloud Build, Artifact Registry,
Eventarc, Cloud Run, Cloud Scheduler) y puede tardar varios minutos. Si pregunta por la política de
limpieza de imágenes de Artifact Registry, acepta (por ejemplo 1 día) para no acumular costo.

## 8. Permiso de lectura de métricas

Las funciones `adminGetUsage` y `usageWatchdog` leen Cloud Monitoring con la cuenta de servicio
de cómputo por defecto (`<número-de-proyecto>-compute@developer.gserviceaccount.com`). Si en
**Opciones maestras → Consumo** ves ceros o errores, dale el rol **Monitoring Viewer** en
Google Cloud Console → IAM.

## 9. Superadmin y alertas

1. Crea tu usuario maestro: [04-superadmin.md](04-superadmin.md).
2. Configura las alertas al 80 %: `npm run monitoring:setup` ([guía](03-plan-blaze-cuotas-y-alertas.md)).

## 10. La app

Registra la app Android y descarga `google-services.json` siguiendo
`docs/03-configurar-firebase.md` del [repo de la app](https://github.com/L-FER-GT/control_tienda_front).
