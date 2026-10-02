# 4. Superadmin (creador de la app)

El superadmin es **un solo usuario** (tú). Inicia sesión en la app como cualquiera, pero al tocar
su avatar ve **Opciones maestras**:

- **Consumo:** uso de Firebase frente a las cuotas gratuitas, con alerta al 80 %.
- **Usuarios:** buscar por nombre o código y deshabilitar/habilitar cuentas (cierra su sesión).
- **Tiendas:** buscar por nombre y deshabilitar/habilitar tiendas.

El privilegio es un *custom claim* `superadmin` en Firebase Auth. Solo lo asigna el script de este
repo; la app no puede otorgarlo y las reglas de seguridad lo verifican en el servidor.

## Configurar el `.env`

```bash
cp .env.example .env
```

```dotenv
FIREBASE_PROJECT_ID=control-tienda-xxxxx
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
SUPERADMIN_EMAIL=tu-correo@ejemplo.com
SUPERADMIN_PASSWORD=una-contraseña-larga-y-segura   # mínimo 12 caracteres
SUPERADMIN_NAME=Administrador del sistema
ALERT_EMAIL=tu-correo@ejemplo.com
```

`firebase-service-account.json` se descarga en Firebase Console → ⚙️ **Configuración del proyecto →
Cuentas de servicio → Generar nueva clave privada**. Guárdalo en la raíz del backend (está en
`.gitignore`) y nunca lo compartas.

## Crear o actualizar el superadmin

```bash
npm run superadmin:seed
```

El script:

1. Crea el usuario en Firebase Auth (o actualiza su contraseña si ya existe).
2. Le asigna el claim `superadmin`.
3. Crea su perfil con código de 10 dígitos (si no lo tenía).
4. **Retira el privilegio a cualquier otro superadmin anterior** (solo puede haber uno).

Si tenías la sesión abierta en la app, cierra sesión y vuelve a entrar para que se lea el nuevo claim.

## Cambiar la contraseña o el correo

Edita el `.env` y vuelve a ejecutar `npm run superadmin:seed`. Si cambias el correo, el usuario
anterior deja de ser superadmin automáticamente.

## En el emulador

```bash
npm run emulators                       # en una terminal
npm run superadmin:seed:emulator        # en otra (usa SUPERADMIN_EMAIL/PASSWORD del .env)
```

En el emulador, la pestaña Consumo muestra **datos de ejemplo** (uno de ellos al 83 % para ver la alerta).
