# 5. Emuladores y pruebas

Con el **Firebase Emulator Suite** se desarrolla y prueba todo sin tocar la nube ni pagar nada.

## Requisitos

- Node.js **22.12+**
- **Java 21** (lo exigen los emuladores). En Windows sirve el de Android Studio:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

## Levantar los emuladores

```bash
npm install              # instala también functions/
npm run emulators        # compila las funciones y levanta Auth, Firestore, Storage y Functions
```

| Servicio | Puerto |
|---|---|
| Panel (Emulator UI) | <http://localhost:4000> |
| Auth | 9099 |
| Firestore | 8080 |
| Storage | 9199 |
| Functions | 5001 |

Los datos se guardan al cerrar (`Ctrl+C`) en `emulator-data/`. Para continuar con esos datos:
`npm run emulators:resume`.

Los emuladores escuchan en `0.0.0.0`, así un **celular físico** en la misma red Wi-Fi puede
conectarse usando la IP de tu PC (configúrala en `local.properties` de la app:
`firebase.emulatorHost=192.168.x.x`). Si no conecta, permite Node y Java en el firewall de Windows.

> La función programada `usageWatchdog` se ignora en el emulador (no hay Pub/Sub);
> `adminGetUsage` devuelve datos de ejemplo.

## Pruebas

```bash
npm test                 # todo: unitarias + reglas + integración
npm run test:functions   # unitarias de Cloud Functions (sin emulador)
npm run test:rules       # reglas de Firestore y Storage contra el emulador
npm run test:integration # stock, números de orden, recepciones e invitaciones contra el emulador
npm run typecheck        # tipos de funciones, scripts y pruebas
```

| Suite | Archivos | Qué valida |
|---|---|---|
| Unitarias | `functions/test/*.test.ts` | Código de 10 dígitos, cuotas y umbral 80 %, zona horaria del Pacífico, cálculo de stock, archivos huérfanos, vigilante de consumo |
| Reglas | `tests/rules/*.test.ts` | Roles por tienda, permisos delegados, tienda pública/privada, invitaciones, órdenes sin número, límite de 5 MB, tipos de archivo |
| Integración | `functions/test/integration/*.int.ts` | Correlativo de órdenes, stock negativo e ilimitado, recepciones editadas/borradas, historial de costos, aceptar invitaciones |

Las mismas pruebas corren en GitHub Actions en cada Pull Request ([06-despliegue-y-ci-cd.md](06-despliegue-y-ci-cd.md)).
