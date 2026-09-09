# Cambios en `vigi-app`

Auditoría del frontend (`../vigi-app`, Astro) contra el backend migrado, hecha
archivo por archivo.

> **Estado: aplicado.** 21 archivos modificados en `vigi-app`, `astro check`
> pasa con 0 errores. Falta **una sola cosa manual**: renombrar
> `AWS_CLOUDFRONT_URL` a `PUBLIC_ASSETS_URL` en el `.env` y en Vercel, y
> apuntarla al dominio público de R2. Sin eso, todas las imágenes rompen.
>
> Lo que sigue documenta qué se cambió y por qué.

---

## 1. Rompe en runtime — hay que tocarlo sí o sí

### `product._id` → `product.id`
El id dejó de llamarse `_id`.

| Archivo | Línea |
|---|---|
| `components/Buttons/BuyButton.tsx` | 14, 29 |
| `components/Icons/Favorite.tsx` | 17, 21, 51 |
| `components/profile/FavoritesInfo.tsx` | 27, 37, 55 |
| `components/profile/PurchasesInfo.tsx` | 26 |
| `services/types.ts` | 4 (la interfaz `Product`) |

`components/Buttons/AddCartButton.tsx:32,40` ya hace `product._id || product.id`,
así que ese sobrevive solo.

### `customer._id` → `customer.id`
`components/Icons/Favorite.tsx:36`.

### `product.favorites` ya no existe
`components/Icons/Favorite.tsx:29` y `:37` hacen
`product.favorites.includes(customer_id)` para pintar el corazón.

Los favoritos pasaron a una tabla de unión, así que el producto ya no trae la
lista de clientes que lo marcaron — **y no debería**: era exponer los ids de
todos tus clientes en cada respuesta del catálogo.

**Resuelto: el componente pide su propia lista.** `GET /api/customer/favorite`
ya devuelve los favoritos del cliente autenticado; el componente chequea
pertenencia contra esa lista.

La alternativa era agregar `is_favorite` a las respuestas de producto, y la
descarté: obligaría a poner auth en `/api/search/*`, que hoy es público, y
volvería cada respuesta del catálogo distinta por usuario — adiós a cachear el
catálogo en CDN. No vale la pena por un corazón pintado.

No hace falta ningún cambio de backend para esto.

### `formatDate` rompe con fechas ISO
`services/scripts.ts:130` parsea cortando el string:

```ts
const day = date.slice(0, 2);
const month = allMonths[parseInt(date.slice(3, 5))];
const year = date.slice(6, 10);
```

Eso funciona con `"17/12/2024, 15:10:30"`. Con `"2026-08-17T12:00:00-03:00"`
devuelve día `"20"`, mes `undefined` y año `"-08-"`. Pasar a `new Date(...)` con
`toLocaleDateString("es-AR")`.

Lo usa `components/profile/PurchasesInfo.tsx:27`.

### Estado de la orden
`components/profile/PurchasesInfo.tsx:38` compara
`purchase.status == "Entregado"`. Nunca matcheó: el backend viejo guardaba
`"En preparación"`. Ahora `status` es el código (`entregado`) y viene además
`status_label` con el texto listo para mostrar.

```tsx
className={purchase.status === "entregado" ? "text-green-700" : "text-orange-400"}
>{purchase.status_label}
```

### Carrusel: cambian los nombres de campo
`components/Carrusel.astro` espera la forma vieja de Mongo, donde había **un
documento con un array adentro**:

- línea 10: `carrusel.images[0].href` → el campo ahora es `link_url`
- línea 20: `i.banner_url` → ahora es `image_url`
- línea 5: `AWS_CLOUDFRONT_URL` (ver abajo)

Además la base guardaba solo el nombre del archivo y la URL se armaba con
`${BASE_URL}/carrusel/${i.banner_url}`. Ahora `image_url` es la URL completa.

**Resuelto: cambia el frontend, no el backend.** Armar la URL en el cliente
concatenando una variable de entorno ata el frontend al layout del bucket: el
día que muevas las imágenes de carpeta, o pongas un CDN adelante, hay que tocar
y redeployar el sitio. Con la URL completa en la base, cambiar de storage no
toca el frontend nunca más.

Son tres líneas en `Carrusel.astro`:

```astro
href={carrusel.images[0].link_url}
...
<img src={i.image_url} />
```

Y se puede borrar el `BASE_URL` de ese archivo.

---

## 2. Variables de entorno

`AWS_CLOUDFRONT_URL` sigue en uso en el frontend y hay que apuntarlo a R2:

- `components/Carrusel.astro:5`
- `pages/category/[category].astro:10` (banners de categoría)

Conviene renombrarla a algo tipo `PUBLIC_ASSETS_URL` de paso, porque ya no tiene
nada que ver con AWS.

---

## 3. Backend — HECHO, no hay que tocar el frontend

### Las rutas de categoría del menú ya funcionan ✅
`services/const.ts` define los paths del nav: `interior`, `exterior`,
**`bateria`**, **`Kits`**, **`analogas`**, `porteros`, `almacenamiento`,
`alarmas`.

El enum de Zod espera `batería` y `análogas` **con acento** y `kits` en
minúscula. Los tres dan 400.

Esto **ya estaba roto antes de la migración** — el enum viejo también tenía los
acentos.

Resuelto normalizando la entrada en vez de enumerar variantes: se le sacan los
acentos, se pasa a minúscula y recién ahí se valida. Así entran `Kits`,
`bateria`, `Batería` y `BATERIA` por el mismo camino, y no hay que volver acá
cada vez que alguien escriba una URL distinto.

Verificado: los 8 links del menú devuelven productos.

### Al schema le faltaban cuatro fichas técnicas ✅
`services/types.ts:15-19` declara que un producto puede traer:

```ts
details: CameraDetails;
dvr_details: DvrDetails;
portero_details: PorteroDetails;
alarm_details: AlarmDetails;
storage_details: StorageDetails;
kit_details: KitDetails;
```

El schema solo tenía `details` y `dvr_details`. Cargar el catálogo real así
habría perdido la ficha de porteros, alarmas, almacenamiento y kits **sin ningún
error**. Es el hallazgo más importante de esta revisión.

Resuelto en `db/migrations/0004_product_detail_sheets.sql`: se agregaron
`portero_details`, `alarm_details`, `storage_details`, `kit_details`,
`description`, `others` y `gallery`. Los repositorios ya las devuelven y el
catálogo mock tiene datos en cada una, así que
`components/ProductCaracteristics.astro` tiene qué renderizar.

Columnas separadas y no un solo blob: son formas genuinamente distintas, cada
producto usa una o dos, y así la API las devuelve como campos de primer nivel
igual que espera `services/types.ts`.

---

## 4. Anda como está — no toques nada

| | Por qué |
|---|---|
| **Login** | `LoginForm.tsx:33` lee `response.data.token` y el backend sigue devolviendo `{success, data:{access, token}}` |
| **Carrito antes del checkout** | `store/cartStore.ts` llama `saveCartData` en cada `addToCart` y `removeItemCart`, así que el servidor siempre tiene el carrito. El checkout leyendo de la base funciona |
| **`PayCartButton`** | Sigue mandando `items`, `amount_to_pay` y `shipments`; ahora se ignoran, pero mandarlos de más no rompe |
| **`price_original` / `price_diferred` en `null`** | Todos los usos van con `?.` (`ProductCard.astro:19,42`, `SearchInput.tsx:71,103`, `product/[model].astro:53,88`), así que `null` no explota |
| **Provincias** | El dropdown usa el const local de `services/const.ts`, no la API |

---

## 5. Código muerto que quedó roto (no urge)

- `services/fetchData.ts:196` — `getProvincesForDropdown` hace
  `res.data[0].provinces`, forma vieja de Mongo. No lo llama nadie.
- `services/fetchData.ts:58` — `deleteItem` pega a `DELETE /api/cart/:id`, una
  ruta que **no existe** en el backend. No lo llama nadie.
- `services/scripts.ts:94` — `addCartAsInvited` (carrito de invitado en
  localStorage) no se usa en ningún lado. Por suerte: si estuviera activo, un
  invitado que agrega productos y después inicia sesión llegaría al checkout con
  el carrito del servidor vacío.

---

## 6. A confirmar

- **`products_total`**: lo calculo como `sum(quantity)`. `services/scripts.ts:16`
  hace `products_total += p.quantity`, o sea unidades totales — **coincide**.
  Confirmado, no hay que tocar nada.
- **Costo de envío**: el front arma `finalTotal` sumando el envío que le
  devolvió `/api/logistic/cost`, y el backend ahora recalcula el suyo con la
  misma función. Deberían dar igual, pero conviene verificarlo con una compra
  real a una dirección fuera de CABA.
- **`has_promotion` con descuento fuera de 1–50**: `ProductCard.astro:16` muestra
  la placa de "Ahorras" con solo mirar `has_promotion`, pero si el descuento está
  fuera de rango `price_diferred` viene `null` y la placa queda vacía. Conviene
  gatillar con `price_diferred` en vez de `has_promotion`.
