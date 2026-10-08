# VIGI API

Backend del e-commerce de cámaras de seguridad vigi.cam (Argentina).

El frontend es un proyecto aparte: **`../vigi-app`** (Astro + Tailwind, deploy en
Vercel). Los dos repos son carpetas hermanas bajo `Desktop/APP/`. Cualquier
cambio en la forma de una respuesta de la API obliga a un cambio allá.

## Comandos

```bash
npm run dev     # nodemon
npm start       # node index.js
npm test        # jest --detectOpenHandles
```

## Arquitectura

Tres capas, estrictas:

```
routes/*.routes.js  →  handlers/<Dominio>/*.handler.js  →  repositories/<dominio>.repository.js
```

- **routes** — montan paths y aplican el middleware `userAuth`.
- **handlers** — manejan `req`/`res`, orquestan varias operaciones de datos,
  arman la respuesta. Es la única capa que conoce HTTP.
- **repositories** — todo el acceso a datos de un dominio en un archivo. Son la
  única capa que conoce el dialecto de la base.

### Repositorios

Todo el acceso a datos pasa por `src/repositories/`. MongoDB ya no existe en
ninguna parte del código.

| Repositorio | Cubre |
|---|---|
| `customer.repository.js` | clientes, direcciones, favoritos |
| `verification.repository.js` | hashes de verificación y reset |
| `cart.repository.js` | carrito e ítems |
| `product.repository.js` | catálogo, búsqueda, facets |
| `order.repository.js` | órdenes e ítems de orden |
| `payment.repository.js` | órdenes de pago de MP y Nave |
| `reference.repository.js` | provincias, carrusel |
| `coupon.repository.js` | cupones, canjes, cupón del carrito |
| `marketing.repository.js` | baja de la lista de novedades |

Lo que queda en `src/controllers/` **no toca la base**: son adaptadores de APIs
externas (Resend, Mercado Pago, Nave). MiCorreo vive en `services/micorreo.js`.

### Precios

Cuatro columnas, y solo la última se lee desde la API:

| Columna | Qué es |
|---|---|
| `cost` | costo del proveedor, lo escribe el importador |
| `margin_pct` | margen de referencia, 30 por defecto |
| `price_override` | precio fijado a mano; `NULL` = usar el margen |
| `price` | resultado, lo mantiene el trigger `products_set_price` |
| `effective_price` | `price` con el descuento aplicado, columna generada |

Actualizar `cost` recalcula `price` solo, **salvo** si hay `price_override`.
Nunca escribir `price` a mano: lo pisa el trigger.

El precio con descuento es una **columna generada**, no un cálculo en JS. Los
repositorios devuelven `effective_price` como `price`. Nunca volver a descontar
en JavaScript: rompe el ordenamiento por precio.

### Catálogo

Se importa de la lista del proveedor (Google Sheet público):

```bash
node db/import/import-catalogue.js            # simulacro
node db/import/import-catalogue.js --apply    # escribe
```

El mapeo de secciones a categorías vive en `db/import/catalogue-map.js` — es lo
que hay que editar cuando el proveedor agrega o renombra una sección. El
importador corta y reporta si encuentra una sección desconocida, en vez de
adivinar.

Reimportar **actualiza** costo y ficha, y **no toca** `price_override`,
`margin_pct`, `discount`, `has_promotion`, `thumbnail` ni `is_active`.

Los precios de checkout salen **siempre** del carrito en la base, nunca del
request. Ver `handlers/Payment/createPaymentOrder.handler.js`.

Migrar un dominio = consolidar sus controllers en un solo
`repositories/<dominio>.repository.js` con SQL, actualizar los handlers que lo
consumen, y borrar la carpeta de controllers.

### Acceso a datos

- `db/client.js` — pool de `pg` contra Supabase. Expone `query(text, params)`,
  `withTransaction(fn)` y `closeConnection()`. **Nunca crear un Pool nuevo.**
  Dentro de `withTransaction` hay que usar el client que recibe `fn`, no
  `query()`, o la sentencia corre fuera de la transacción.
- `db/result.js` — `created()` / `updated()` normalizan las escrituras a
  `{ matched, modified, inserted, id }`. Los handlers nunca deben leer campos
  del driver. Agregar `returning id` para que `id` venga poblado.
- El schema vive en `db/migrations/`, ya aplicado en Supabase.
- `numeric` se parsea a float en `db/client.js` para que la API siga mandando
  números y no strings.

Conexión: `DATABASE_URL` en `.env`.

Entrypoint: `index.js` → `src/app.js` (CORS por whitelist, router bajo `/api`,
estáticos de `uploads/` en `/public`).

### Convenciones

- Los controllers se importan con guion bajo: `const _getX = require(...)`.
- `userAuth` (`src/middlewares/userAuth.js`) verifica el JWT e **inyecta
  `customer_id` y `cart_id` en `req.body` y `req.params`**. Por eso los handlers
  leen el id del cliente desde el body y no de un parámetro de ruta.
- Validación con Zod en `src/services/zod_schemas/`. Se usa solo en algunos
  endpoints, no en todos.
- Los remitentes de email salen de `src/utils/senders.js`, que los arma desde
  `EMAIL_DOMAIN`. **Nunca hardcodear una dirección en un handler.**

## Dominios

| Ruta | Auth | Qué hace |
|---|---|---|
| `/api/search` | pública | productos, órdenes, sugerencias, carrusel, provincias |
| `/api/customer` | mixta | registro, login, perfil, favoritos, verificación de email, reset de password, foto de perfil |
| `/api/cart` | JWT | agregar producto, vaciar, obtener, cupón, forma de entrega |
| `/api/payment` | mixta | crear orden (MP o Nave), 2 webhooks, feedback |
| `/api/logistic` | JWT | cotización de envío y sucursales (Correo Argentino) |
| `/api/order` | JWT | órdenes del cliente |
| `/api/marketing` | pública | baja de la lista de novedades |

### Cupones y envío

Dos reglas, una sola idea: **nada que baje el precio llega en el request.**

- El cupón elegido se guarda en `carts` (`coupon_id`). El body del pago no
  lo trae.
- **El retiro en oficina se dio de baja.** `carts.local_pickup` sigue en la
  base pero el checkout lo ignora y `PUT` de la forma de entrega rechaza
  `true`. No volver a leerlo sin reabrir el retiro en la web y en WhatsApp.
- `services/coupons.js` decide si un cupón aplica y cuánto descuenta. Es una
  función pura, sin base.
- `services/checkout.js` (`buildTotals`) arma subtotal, descuento, envío y
  total. La usan **el cotizador y el checkout**, para que lo que se muestra y
  lo que se cobra no puedan divergir. Vuelve a validar el cupón en cada
  llamada: uno que venció con el carrito abierto se cae solo.
- El descuento se reparte entre los ítems (`applyDiscountToItems`) porque
  Mercado Pago arma el total sumando la preferencia y no acepta importes
  negativos.
- Un cupón con `customer_id` es **personal**: para cualquier otro cliente
  `evaluateCoupon` responde `not_found`. Los genera el recupero de carritos
  (`supabase/functions/cart-recovery`, migración 0021) con `origin =
  'cart_recovery'`; el panel no puede crearlos.
- El canje se registra cuando **se crea la orden** (o sea, con el pago
  aprobado), no cuando el cliente escribe el código. Como el webhook llega
  después y solo trae ítems ya descontados, el checkout deja el monto anotado
  en `carts.coupon_discount` y la orden lo consume.

Envío: **Correo Argentino** (API MiCorreo), que reemplazó a Andreani en
octubre de 2026. Spec y respuestas reales en `vigi-admin/docs/correo-argentino.md`.

- `services/micorreo.js` — cliente: token cacheado, `rates`, `agencies`.
  Reintenta cortes de conexión y 429: el servidor de Correo (Imperva) resetea
  conexiones al azar y **bloquea la IP un par de minutos ante ráfagas** de
  pedidos. No martillarlo en pruebas.
- `services/bulto.js` — arma los bultos desde los ítems del carrito. **Las
  medidas son siempre las del perfil de caja** de la categoría (o "Estándar");
  el peso, el del producto si lo tiene, si no el del perfil (migración 0023). Se apilan; pasados 25 kg o 150 cm se abre otro bulto y se suman las
  cotizaciones. Función pura con test.
- `services/shipping.js` — `quoteShipping` cotiza domicilio (`D`) y sucursal
  (`S`), solo servicio Clásico, y devuelve lo elegido. **Gratis:** en CABA,
  todo; fuera de CABA, solo la sucursal y desde `FREE_SHIPPING_MIN_PURCHASE`
  ($450.000, medido sobre el subtotal con cupón).
- Tercera opción, **acordar el envío** (`A`): no se cobra, el cliente paga solo
  los productos y **él escribe por WhatsApp** (menú de Kapso → "Acordar envío de
  compra" → número de pedido). `kapso/functions/vigi-acordar` valida el número
  con `GET /api/order/acordar/:payment_id` (público, sin datos del cliente) y
  pasa la charla a una persona. El mail de compra y la pantalla de pago aprobado
  traen el link con el mensaje armado (`utils/whatsapp.js`); el mail al admin
  dice "acordar envío" en el asunto. Es para cerrar la venta: si Correo falla, `quoteShipping` no
  lanza, devuelve `cost: null` + `quote_error`, y el checkout ofrece `A`.
  `createPaymentOrder` se niega a cobrar con `cost` null.
- La elección vive en el carrito (`carts.delivery_type`, `shipping_agency`,
  migración 0028): `PUT /api/cart/delivery { delivery_type: "D"|"S"|"A", agency_code }`. La
  sucursal se valida contra MiCorreo y se guarda como snapshot.
  `GET /api/logistic/agencies` lista las de la provincia del cliente, las
  cercanas a su CP primero.
- Al pagar, `createPaymentOrder` congela el costo en `carts.shipping_cost` y la
  orden lo copia (`orders.delivery_type`, `shipping_agency`, `shipping_cost`),
  igual que el cupón.

Perfiles de caja asignados el 2026-10-08 (Chico, Cámara, Mediano, Grabador,
Cerradura, Monitor, Kit) con medidas **estimadas**: ajustarlos con cajas reales
desde vigi-admin `/envios`. `valorDeclarado` no se manda todavía (MiCorreo lo
pide recién en `/shipping/import`, fase 2).

### Mails de estado del pedido

Los manda `supabase/functions/order-notifications` (ver su README), no la
API. El panel cambia el estado con un modal de confirmación ("¿Pasar a En
camino? [x] Mandarle un mail al cliente") y la function cambia el estado y
manda el mail en el momento, para `enviado` ("En camino"), `entregado`,
`cancelado` y `reembolsado`. Queda registrado en `order_notifications`
(migración 0025). El seguimiento (`carrier`, `tracking_number`,
`tracking_url`) se carga desde el panel y va en el mail de "En camino" y en
"Mis pedidos".

El código del estado sigue siendo `enviado`; solo cambió la etiqueta.

### Pagos

#### Registrar un pago de Mercado Pago: tres puertas, una sola función

`services/payments.js` → `recordMercadoPagoPayment(paymentId)`. La llaman:

| Camino | Cuándo |
|---|---|
| `POST /api/payment/webhook` | notificación de MP |
| `GET /api/payment/feedback` | el navegador del cliente al volver del checkout |
| `node db/reconcile-mercadopago.js --apply` | por cron, busca aprobados sin orden |

**Los tres son independientes: alcanza con que uno funcione.** Es idempotente
—el pago se upsertea por `gateway_payment_id`, la orden tiene `on conflict
(payment_id) do nothing`— así que llamarla diez veces deja una orden y un mail.

Esto no es paranoia de diseño. En agosto de 2026 un pago aprobado no quedó
registrado: el webhook leía la notificación **solo de la query string**, y MP
hoy manda Webhooks v2 con todo en el body. `req.query.type` venía `undefined`,
el handler contestaba 200 y no hacía nada; MP lo daba por entregado y no
reintentaba. La venta desapareció sin dejar una línea de log.

Reglas que salieron de ahí, y que conviene no aflojar:

- El parser (`utils/mpPayment.js`) acepta los tres formatos vivos de MP: v2 por
  body, v2 por query e IPN. Tiene test propio.
- **Nunca 200 cuando algo falló.** El webhook devuelve 500 para que MP
  reintente. Un 200 mentiroso quema el único reintento que había.
- `createOrder.handler.js` **propaga** los errores. Antes los atrapaba y
  devolvía el Error, así que el que llamaba creía que había salido todo bien.
- La orden se crea **solo con el pago aprobado**, y el carrito se vacía solo
  ahí. Antes se hacían las dos cosas con cualquier estado: un rechazo entraba
  como venta y además le borraba el carrito al cliente.
- El `customer_id` viaja en `metadata` de la preferencia. Antes iba solo dentro
  de `payer.last_name` —un campo de nombre— y MP no garantiza devolver
  `additional_info`.

#### URLs armadas desde variables de entorno: usar `utils/urls.js`

Siempre `joinUrl(process.env.LO_QUE_SEA, "/la/ruta")`, nunca template string.

Una barra al final de `MP_BACK_URL` dejaba las URLs como `//api/payment/...`, y
Express devuelve 404 con eso: `//api` son un segmento vacío y `api`, no la ruta
`/api`. Rompió tres cosas a la vez —el webhook de MP, las `back_urls` y el link
de verificación de email— y ninguna avisó.

`app.js` tiene además un middleware que colapsa las barras repetidas antes del
router. No es redundante: `notification_url` y `back_urls` quedan **congeladas
dentro de cada preferencia** cuando se crea, así que las preferencias ya
emitidas siguen golpeando con el doble slash mucho después de arreglar la
variable. Cuando el middleware actúa lo loguea con `[url]`; si aparece seguido
en producción, hay una variable de entorno con barra al final.

Dos pasarelas. `createPaymentOrder.handler.js` bifurca según `method == "nv"`:
Nave pide un bearer token OAuth y devuelve `checkout_url` (normalizado a
`init_point`); si no, va a Mercado Pago. Cada una tiene su webhook, que guarda la
orden de pago, crea la orden, manda emails al comprador y al `ADMIN_EMAIL`, y
vacía el carrito.

Detalle heredado: el `customer_id` viaja dentro de `payer.last_name` en el
payload de Mercado Pago.

## Migración de stack en curso

| Paso | Estado |
|---|---|
| AWS SES → Resend | hecho |
| AWS S3 → Cloudflare R2 | hecho |
| Schema Postgres (Supabase) | hecho, corrido en Supabase |
| Capa de repositorio | **pendiente, es el próximo paso** |
| Carga del catálogo | pendiente |
| Swap Mongo → Postgres | pendiente |

**El código todavía habla con MongoDB.** El schema Postgres vive en
`db/migrations/` y ya está aplicado en Supabase, pero ningún controller lo usa.

Antes de encarar el swap, leer **`db/CUTOVER_NOTES.md`**: lista los cambios de
código que rompen contra el schema nuevo. No aplicarlos antes de tiempo — nada
los verifica mientras los handlers sigan contra Mongo.

El plan es meter primero una capa de repositorio **contra Mongo**, sin cambio de
comportamiento, para que el swap final no sea un big-bang de 39 archivos.

## Base de datos

Hoy: MongoDB Atlas con el driver nativo, sin ODM. `db_conn(db, collection)`
abre una conexión **por llamada** (`src/services/db_conn.js`) — es una de las
cosas que la capa de repositorio tiene que resolver.

Los nombres de colección salen de variables de entorno (`DB_PRODUCT`,
`DB_ORDERS`, `DB_CUSTOMERS`, `DB_CARTS`, `PAYMENT_ORDERS`, `DB_VERIFY_HASH`).

## Entorno

`.env` (gitignored). Grupos: `DB_*` (Mongo), `JWT_SECRET`, `MP_*` (Mercado
Pago), `NAVE_*`, `RESEND_API_KEY` + `EMAIL_DOMAIN`, `R2_*`, `CLIENT_URL`,
`ADMIN_EMAIL`.

## Cosas rotas conocidas

- `getProvinces.controller.js` usa `process.env.DB_PROVINCES`, que nunca se
  definió.
- `sendNotification.js` no lo llama nadie.
- `getFavorites.handler.js` trae **todos** los productos y filtra en JS.
- `customers.has_order_active` se pone en `true` y nunca vuelve a `false`.
