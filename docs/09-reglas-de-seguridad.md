# 9. Reglas de seguridad

La seguridad real está en [`firestore.rules`](../firestore.rules) y [`storage.rules`](../storage.rules),
no en la app: aunque alguien modifique la app, el servidor rechaza lo que su rol no permite.

## Principios

1. **Todo denegado por defecto**; solo se abre lo necesario.
2. **Roles por tienda** leídos desde `stores/{id}/members/{uid}` en cada petición.
3. El dueño puede todo en su tienda; un empleado, solo lo que tenga en `permissions`.
4. Lo que debe ser confiable lo escribe **solo el servidor** (Cloud Functions): números de orden,
   stock por ventas y recepciones, membresías al aceptar invitaciones, códigos de usuario,
   privilegio de superadmin, deshabilitar usuarios y tiendas.
5. Una tienda deshabilitada por el sistema no acepta escrituras.

## Matriz de permisos (Firestore)

| Colección | Leer | Crear / editar |
|---|---|---|
| `stores/{id}` | Pública: cualquier usuario. Privada: miembros activos. Superadmin: todas | Crear: cualquiera (como dueño). Editar: `edit_store`, sin cambiar dueño ni estado del sistema |
| `members` | El propio miembro, `members`, superadmin | Dueño al crear su tienda; `members` para habilitar y dar permisos (nunca al dueño ni a sí mismo; los clientes no reciben permisos) |
| `invitations` | `members` y el invitado | `members` crea pendientes y cancela; aceptar/rechazar solo vía función |
| `categories` | Quien puede ver la tienda | `manage_categories` |
| `products` | Quien puede ver la tienda | `manage_products` (o `receptions` para crear); `manage_categories` solo puede cambiar `categoryId` |
| `priceHistory` | `manage_products`, `reports` | `manage_products`, `receptions` |
| `orders` | El vendedor (sus ventas) o `reports` | Empleados y dueño, sin número, `pending`, con ítems; nunca se editan |
| `suppliers` | `suppliers`, `receptions`, `reports` | `suppliers` ("otros" es virtual) |
| `receptions` | `receptions`, `reports` | `receptions` |
| `ledgers`, `meta`, `system` | — | Solo servidor |
| `users/{uid}` | El dueño de la cuenta y el superadmin | El usuario: nombre, teléfono y foto |
| `publicProfiles` | Cualquier usuario autenticado | El usuario: nombre y foto |
| `userCodes/{code}` | Lectura puntual (no se puede listar) | Solo servidor |

Validaciones de datos: textos con longitud máxima, montos enteros no negativos, `salePriceCents`
obligatorio, `stockAlert > 0`, máximo 300 ítems por orden y 10 fotos por recepción.

## Storage

| Ruta | Leer | Subir |
|---|---|---|
| `users/{uid}/…` | Usuarios autenticados | Solo el dueño; imagen < 5 MB |
| `stores/{id}/store/…` | Usuarios autenticados | `edit_store` |
| `stores/{id}/categories/…` | Usuarios autenticados | `manage_categories` |
| `stores/{id}/products/…` | Usuarios autenticados | `manage_products` o `receptions` |
| `stores/{id}/receptions/…` | Usuarios autenticados | `receptions`; imagen, PDF o Excel |

Todo archivo debe pesar **menos de 5 MB**. Los nombres son UUID aleatorios, imposibles de adivinar.

## Limitación conocida

Firestore no permite ocultar campos individuales: el campo `stock` viaja con el producto. La app
solo lo muestra a quien tiene `view_stock` (y siempre al dueño). Si en el futuro el stock debe ser
confidencial frente a clientes, se puede mover a una subcolección con su propia regla.

Las pruebas de todas estas reglas están en [`tests/rules`](../tests/rules) ([guía](05-emuladores-y-pruebas.md)).
