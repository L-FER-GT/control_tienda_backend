# 6. Despliegue y CI/CD

## Ramas

| Rama | Qué pasa |
|---|---|
| `feature/*` | [`ci.yml`](../.github/workflows/ci.yml): tipos, pruebas unitarias, reglas e integración |
| `develop` | `ci.yml` (no despliega) |
| `master` | **Producción:** [`deploy.yml`](../.github/workflows/deploy.yml) prueba y ejecuta `firebase deploy` |

Flujo: `feature/*` → PR a `develop` → PR de `develop` a `master` → despliegue automático.

## Despliegue manual

```bash
firebase login
npm run deploy             # todo
npm run deploy:rules       # solo reglas e índices de Firestore + reglas de Storage
npm run deploy:functions   # solo Cloud Functions
```

Todos usan el alias `prod` de [`.firebaserc`](../.firebaserc).

## Configurar el despliegue automático

### 1. Cuenta de servicio de despliegue

Google Cloud Console → **IAM y administración → Cuentas de servicio → Crear**:

- Nombre: `github-deploy`
- Roles:
  - **Firebase Admin**
  - **Cloud Functions Admin**
  - **Cloud Run Admin**
  - **Service Account User**
  - **Artifact Registry Administrator**
  - **Cloud Scheduler Admin**
  - **Eventarc Admin**
- **Claves → Agregar clave → JSON** y descárgala.

> Si un despliegue falla por permisos, el mensaje del log dice qué rol falta: agrégalo a la cuenta.

### 2. Environment en GitHub

Repo → **Settings → Environments → New environment** → `produccion`:

| Tipo | Nombre | Valor |
|---|---|---|
| Secreto | `FIREBASE_SERVICE_ACCOUNT_JSON` | Contenido completo del JSON de `github-deploy` |
| Variable | `FIREBASE_PROJECT_ID` | ID del proyecto, p. ej. `control-tienda-xxxxx` |

Recomendado: en el environment activa **Required reviewers** para aprobar cada despliegue y
**Deployment branches → Selected branches → `master`**.

### 3. Listo

Cada push a `master` ejecuta pruebas y, si pasan, despliega reglas, índices y funciones.

## Qué se despliega

| Archivo | Destino |
|---|---|
| `firestore.rules` | Reglas de Firestore |
| `firestore.indexes.json` | Índices compuestos y de collection group |
| `storage.rules` | Reglas de Storage (límite de 5 MB) |
| `functions/` | 16 Cloud Functions en `us-east1` |
