-- Publicación de catálogo en MercadoLibre, además de la tradicional.
--
-- En el catálogo todos los vendedores de un mismo producto comparten una ficha
-- y compiten por el botón de compra (precio, envío y reputación). La
-- publicación de catálogo se crea desde la tradicional (optin) y es otro item
-- de MercadoLibre, con su propio id y su propio precio.
--
-- Se guarda en la misma fila que la tradicional: es el mismo producto, y lo
-- que interesa es verlas juntas.

alter table meli_listings
  -- Ficha del catálogo a la que se asocia. La asigna MercadoLibre (por GTIN)
  -- o se elige en el panel entre los resultados del catálogo.
  add column catalog_product_id text,

  -- Id del item de catálogo. NULL hasta que se hace el optin.
  add column catalog_item_id    text unique,

  -- Antes del optin, la elegibilidad (READY_FOR_OPTIN, NOT_ELIGIBLE,
  -- PRODUCT_INACTIVE, ALREADY_OPTED_IN…). Después, la competencia: winning,
  -- competing, sharing_first_place o listed. Tal cual lo devuelve MercadoLibre.
  add column catalog_status     text,

  add column catalog_price      numeric(12,2),
  add column price_to_win       numeric(12,2),

  -- Precio más bajo que todavía deja el margen mínimo de catálogo. El panel no
  -- deja poner nada por debajo.
  add column catalog_min_price  numeric(12,2),

  add column catalog_checked_at timestamptz;

-- Margen mínimo para competir en catálogo. Más bajo que el de la tradicional:
-- en catálogo se gana por precio, y un poco menos de margen puede ser la
-- diferencia entre vender y no vender. Pero nunca cero.
alter table meli_settings
  add column catalog_min_margin_pct numeric(5,2) not null default 8
    check (catalog_min_margin_pct >= 0);

grant update (catalog_min_margin_pct) on meli_settings to authenticated;

-- La ficha la puede elegir una persona. El resto lo escribe la function.
grant update (catalog_product_id) on meli_listings to authenticated;
