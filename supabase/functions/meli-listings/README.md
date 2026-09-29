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

## Pendiente de verificar contra la API real

- Si la cuenta está en el modelo **User Products**, MercadoLibre pide
  `family_name` en vez de `title`. La function prueba con `title` y, si el
  error menciona `family_name`, repite con eso.
- En categorías de catálogo (como Cámaras de Seguridad) MercadoLibre puede
  exigir asociar la publicación a un producto del catálogo. Si pasa, el error
  aparece en la fila y hay que sumar ese paso.
