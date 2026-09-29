-- Publicaciones propias en MercadoLibre, administradas desde el panel (/meli).
--
-- Una fila por producto. La crea y la mantiene la Edge Function
-- `meli-listings`, que es la única que habla con MercadoLibre (el token no
-- puede estar en el navegador). El panel lee todo y edita solo lo que es
-- decisión humana: título, categoría, stock, atributos y la configuración.
--
-- El precio NO se edita a mano acá: lo calcula la function a partir del costo,
-- el margen objetivo y la comisión real que devuelve MercadoLibre para esa
-- categoría y ese precio. Un precio escrito a mano en una publicación es un
-- precio que no se entera cuando cambia el costo.

-- ---------------------------------------------------------------------------
-- Configuración (una sola fila)
-- ---------------------------------------------------------------------------

create table meli_settings (
  id                 boolean primary key default true,

  -- Ganancia neta buscada sobre el costo, después de comisión, envío e
  -- impuestos. No es el margin_pct de la web: allá no hay comisión de ML.
  margin_pct         numeric(5,2)  not null default 15 check (margin_pct >= 0),

  -- Retenciones e impuestos que MercadoLibre descuenta de cada venta
  -- (IIBB, percepciones). Dependen de la situación fiscal: por eso es un
  -- número a completar y no una constante.
  taxes_pct          numeric(5,2)  not null default 0 check (taxes_pct >= 0 and taxes_pct < 50),

  -- gold_special = Clásica, gold_pro = Premium (cuotas sin interés).
  listing_type_id    text          not null default 'gold_special'
                       check (listing_type_id in ('gold_special', 'gold_pro')),

  -- La base no tiene stock: todas las publicaciones salen con esta cantidad
  -- salvo que se cambie en la fila.
  default_quantity   integer       not null default 5 check (default_quantity > 0),

  -- Desde este precio MercadoLibre obliga a ofrecer envío gratis y el
  -- vendedor paga (parte de) el envío. Verificar el valor vigente en
  -- MercadoLibre: cambia seguido.
  free_shipping_min  numeric(12,2) not null default 33000 check (free_shipping_min >= 0),

  -- Lo que se estima que paga VIGI por cada envío gratis. Es un promedio: el
  -- costo real depende del peso y el destino.
  shipping_cost      numeric(12,2) not null default 9000 check (shipping_cost >= 0),

  -- El precio se redondea hacia arriba a este múltiplo.
  rounding           integer       not null default 100 check (rounding > 0),

  -- Atributos que MercadoLibre pide en casi todas las categorías.
  vat                text          not null default '21 %',
  warranty_time      text          not null default '6 meses',

  updated_at         timestamptz   not null default now(),

  constraint meli_settings_singleton check (id)
);

insert into meli_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------

create table meli_listings (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null unique references products (id) on delete cascade,

  -- NULL hasta que se publica.
  meli_item_id     text unique,

  -- draft     preparada en el panel, nunca validada o con cambios
  -- ready     MercadoLibre la validó sin errores, lista para publicar
  -- error     la última validación o publicación falló (ver errors)
  -- active / paused / closed / under_review / inactive
  --           estado de la publicación en MercadoLibre, tal cual lo devuelve
  status           text not null default 'draft'
                     check (status in ('draft', 'ready', 'error', 'active', 'paused',
                                       'closed', 'under_review', 'inactive')),

  title            text,
  category_id      text,
  category_name    text,
  listing_type_id  text,
  quantity         integer check (quantity >= 0),

  -- Atributos cargados a mano, por id de MercadoLibre: {"SURVEILLANCE_CAMERA_TYPE": "Domo"}.
  -- Pisan a los que la function deduce del producto.
  attributes       jsonb not null default '{}'::jsonb,

  -- Cotización: el precio y de dónde sale. Los escribe la function.
  price            numeric(12,2),
  cost_basis       numeric(12,2),
  fee_amount       numeric(12,2),
  shipping_cost    numeric(12,2),
  taxes_amount     numeric(12,2),
  net_profit       numeric(12,2),
  quoted_at        timestamptz,

  -- Lo que devolvió MercadoLibre la última vez que se validó o publicó.
  errors           jsonb,
  permalink        text,
  sold_quantity    integer not null default 0,
  synced_at        timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index meli_listings_status_idx on meli_listings (status);

create trigger meli_listings_set_updated_at
  before update on meli_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Acceso del panel
-- ---------------------------------------------------------------------------

alter table meli_settings enable row level security;
alter table meli_listings enable row level security;

create policy admin_lee_meli_settings on meli_settings for select to authenticated
  using (is_admin());
create policy admin_edita_meli_settings on meli_settings for update to authenticated
  using (is_admin()) with check (is_admin());

create policy admin_lee_meli_listings on meli_listings for select to authenticated
  using (is_admin());
create policy admin_edita_meli_listings on meli_listings for update to authenticated
  using (is_admin()) with check (is_admin());

revoke all on meli_settings, meli_listings from anon, authenticated;

grant select on meli_settings, meli_listings to authenticated;

grant update (margin_pct, taxes_pct, listing_type_id, default_quantity,
              free_shipping_min, shipping_cost, rounding, vat, warranty_time,
              updated_at)
  on meli_settings to authenticated;

-- Precio, estado, id de MercadoLibre y errores quedan afuera a propósito: los
-- escribe la function con lo que responde MercadoLibre. Si el panel pudiera
-- escribir "active" o un precio, la fila dejaría de describir la publicación.
grant update (title, category_id, category_name, listing_type_id, quantity, attributes)
  on meli_listings to authenticated;
