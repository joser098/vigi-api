# meli-listings

Publica y administra productos de VIGI en MercadoLibre. La usa la página
**MercadoLibre** (`/meli`) de `vigi-admin`.

No toca la tienda: no escribe en `products` ni cambia precios de vigi.com.ar.
Todo vive en `meli_listings` y `meli_settings` (migración `0017`).

## Puesta en marcha

1. Aplicar `vigi-api/db/migrations/0017_meli_listings.sql`. Necesita la `0009`
   (tabla `meli_credentials`).
2. Desplegar, desde `vigi-api/`:

   ```bash
   npx supabase functions deploy meli-listings --project-ref gqpoxkuzmygrmhltubyp
   ```

   Usa `MELI_CLIENT_ID`, `MELI_CLIENT_SECRET` y `R2_PUBLIC_URL`. Es un solo
   archivo sin imports locales, así que también se puede pegar en el editor del
   dashboard de Supabase.
3. En la aplicación de MercadoLibre (developers.mercadolibre.com.ar → Mis
   aplicaciones) cargar como **Redirect URI** la dirección del panel más
   `/meli`, `https://vigi-admin.vercel.app/meli` (ya cargada en la app vigi-admin), y habilitar los
   permisos de lectura, escritura y `offline_access`.
4. Entrar a `/meli` en el panel y tocar **Conectar cuenta de MercadoLibre**,
   logueado en MercadoLibre con la cuenta **vendedora**. Vuelve al panel y el
   token queda guardado en `meli_credentials`.

## Cómo calcula el precio

El menor precio que, descontando la comisión real de MercadoLibre para esa
categoría y tipo de publicación (`/sites/MLA/listing_prices`), el envío gratis
cuando corresponde y los impuestos configurados, deja la ganancia buscada sobre
`products.cost`. Como la comisión depende del precio, se itera hasta que el
precio no cambia (2 o 3 consultas).

## Acciones

`status`, `connect`, `attributes`, `prepare`, `quote`, `validate`, `publish`,
`update`, `reprice`, `sync`. Ver el comentario al principio de `index.ts`.

Publicar siempre valida antes con `POST /items/validate`: si MercadoLibre la
rechaza, no se crea nada y los errores quedan en `meli_listings.errors`.

## Catálogo (migración 0018)

Cada producto puede tener dos publicaciones: la tradicional y la de catálogo,
que se crea desde la tradicional con `POST /items/catalog_listings` (optin) y
compite por el botón de compra de la ficha.

- `catalog_check`: antes del optin, la elegibilidad
  (`/items/{id}/catalog_listing_eligibility`) y la ficha si MercadoLibre ya la
  asignó por GTIN. Después, la competencia (`/items/{id}/price_to_win`): estado
  y precio para ganar.
- `catalog_optin`: necesita `catalog_product_id`, que se elige en el panel.
- `catalog_price`: cambia el precio de la de catálogo. **Nunca por debajo** del
  precio que deja `meli_settings.catalog_min_margin_pct` de ganancia (8% por
  defecto), recalculado en el momento con el costo actual.

## Cuotas sin interés (migración 0019)

| Opción | Tipo | Campaña |
|---|---|---|
| `none` | `gold_special` (Clásica) | — |
| `3x` | `gold_pro` | tag `3x_campaign` (3 cuotas al mismo precio) |
| `6x` | `gold_pro` | — (6 cuotas, lo que Premium da por defecto) |

- La comisión se consulta con la campaña (`listing_prices?...&tags=3x_campaign`):
  incluye el cargo por financiar las cuotas, así que el precio mantiene la
  ganancia.
- 3 cuotas solo para cuentas y categorías habilitadas
  (`/special_installments/3x_campaign/sellers/{id}` y
  `.../categories/{cat}/enabled`). Si la categoría no la admite, al preparar
  queda sin cuotas y se avisa.
- La tag se activa con `PUT /items/{id}` mandando **todas** las tags (el PUT
  reemplaza la lista).
- `installments` cambia las cuotas de una publicada: tipo
  (`POST /items/{id}/listing_type`), campaña y precio.

## Lo que se aprendió probando contra la API real (29/09/2026)

- **La cuenta está en el modelo User Products:** pide `family_name` en vez de
  `title`. La function prueba con `title` y, si el error menciona
  `family_name`, repite con eso.
- **`/items/validate` con `family_name` responde 400 "Validation error" con
  solo avisos** (`shipping.lost_me1_by_user`, `item.shipping.mandatory_free_shipping`)
  aunque la publicación esté completa: se probaron 18 variantes y la
  publicación real (`POST /items`) salió bien. Por eso un 400 con solo avisos se
  toma como aprobado; con cualquier error, frena.
- **GTIN obligatorio** para marcas registradas (Ezviz, Dahua, Commax…): no
  acepta `EMPTY_GTIN_REASON`. Se busca en el catálogo (`/products/search`) y
  solo se completa solo con una coincidencia exacta de modelo; si no, se elige
  a mano en el panel.
- **Fotos:** la carpeta en R2 lleva el modelo con "+" literales. MercadoLibre
  decodifica "+" como espacio, no encuentra la foto y pausa la publicación. Se
  mandan con `%2B`. Si una publicación quedó pausada sin foto, `update` con
  `pictures: true` las reenvía.
- `status.mercadoenvios` de `/users/me` puede decir `not_accepted` con
  Mercado Envíos activo: lo que vale son `/users/{id}/shipping_preferences`.
- `diagnose` valida un producto en variantes (`set` / `unset` de campos) sin
  crear nada: sirve para aislar qué rechaza MercadoLibre.
