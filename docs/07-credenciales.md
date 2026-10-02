# 7. Credenciales del backend

Ningún secreto se guarda en el repositorio (es público).

| Credencial | Para qué | Dónde se obtiene | Dónde se guarda |
|---|---|---|---|
| ID del proyecto | Apuntar CLI, scripts y CI al proyecto real | Firebase Console → Configuración del proyecto → General | `.firebaserc` (alias `prod`), `.env` (`FIREBASE_PROJECT_ID`), variable de GitHub `FIREBASE_PROJECT_ID` |
| Sesión de Firebase CLI | Desplegar desde tu PC | `firebase login` | Perfil de tu usuario (fuera del repo) |
| Clave del Admin SDK | Scripts locales: superadmin y alertas | Firebase Console → Configuración → **Cuentas de servicio → Generar nueva clave privada** | `firebase-service-account.json` en la raíz (ignorado) + `GOOGLE_APPLICATION_CREDENTIALS` en `.env` |
| Usuario y contraseña maestra | Superadmin de la app | Los defines tú | `.env`: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` ([guía](04-superadmin.md)) |
| Correo de alertas | Recibir alertas al 80 % | Tu correo | `.env`: `ALERT_EMAIL` |
| Cuenta de servicio de despliegue | GitHub Actions despliega a producción | Google Cloud → IAM → Cuentas de servicio ([roles](06-despliegue-y-ci-cd.md)) | Secreto `FIREBASE_SERVICE_ACCOUNT_JSON` del environment `produccion` |

## Archivos que nunca deben subirse

```
.env
firebase-service-account.json   (y cualquier *service-account*.json)
functions/.env*
```

Ya están en [`.gitignore`](../.gitignore). Antes de cada commit revisa `git status`.

## Rotar credenciales

| Si… | Haz esto |
|---|---|
| Se filtró una clave de cuenta de servicio | Google Cloud → Cuentas de servicio → la cuenta → **Claves** → elimina la clave → genera otra y actualiza `.env` / el secreto |
| Se filtró la contraseña maestra | Cámbiala en `.env` → `npm run superadmin:seed` |
| Alguien dejó de colaborar | Quítalo de IAM de Google Cloud y de los colaboradores de GitHub |
