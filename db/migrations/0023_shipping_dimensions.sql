-- Peso y medidas de envío por producto.
--
-- Hoy toda cotización usa un bulto fijo de 3,5 kg / 20×25×35 (ver CLAUDE.md,
-- "Pendiente: dimensiones por producto"), y un kit real pesa 10 o 18 kg. Esto
-- es el primer paso: dónde guardar el dato y cómo cargarlo desde el panel.
-- La cotización (Andreani hoy, Correo Argentino después) NO lo lee todavía.
--
-- Dos niveles, del más aproximado al más exacto:
--
--   1. Perfil de caja por categoría. Unas pocas cajas típicas ("Chico",
--      "Kit"…) medidas una vez; cada categoría apunta a una. Cubre todo el
--      catálogo desde el primer día.
--
--   2. Medidas propias del producto, cargadas a mano desde la ficha oficial
--      del fabricante o sugeridas por MercadoLibre. Si están, mandan sobre
--      el perfil.
--
-- Todo es del bulto listo para despachar (con caja), no del producto suelto:
-- es lo que cobra el correo.

-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

create table shipping_profiles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  -- Enteros: Correo Argentino y Andreani piden gramos y centímetros enteros.
  weight_grams  integer not null check (weight_grams > 0),
  height_cm     integer not null check (height_cm > 0),
  width_cm      integer not null check (width_cm > 0),
  length_cm     integer not null check (length_cm > 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger shipping_profiles_updated_at before update on shipping_profiles
  for each row execute function set_updated_at();

-- El bulto que cotiza Andreani hoy para todo. Arranca como perfil para que
-- asignarlo no cambie nada respecto de lo actual.
insert into shipping_profiles (name, weight_grams, height_cm, width_cm, length_cm, notes)
values ('Estándar', 3500, 20, 25, 35, 'El bulto fijo que se cotiza hoy para todo el catálogo.');

alter table categories
  add column shipping_profile_id uuid references shipping_profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Medidas propias del producto
-- ---------------------------------------------------------------------------

alter table products
  add column weight_grams    integer check (weight_grams > 0),
  add column height_cm       integer check (height_cm > 0),
  add column width_cm        integer check (width_cm > 0),
  add column length_cm       integer check (length_cm > 0),

  -- De dónde salió el dato: la ficha del fabricante es más confiable que una
  -- publicación de MercadoLibre, y las dos más que un número a ojo.
  add column dims_source     text check (dims_source in ('official', 'meli', 'manual')),
  add column dims_url        text,
  add column dims_checked_at timestamptz,

  -- Las cuatro o ninguna: un bulto con peso y sin medidas no se puede
  -- cotizar, y caer al perfil a medias sería peor que caer entero.
  add constraint products_dims_completas
    check (num_nonnulls(weight_grams, height_cm, width_cm, length_cm) in (0, 4));

comment on column products.weight_grams is
  'Peso del bulto listo para despachar, en gramos. NULL = usar el perfil de la categoría.';

-- ---------------------------------------------------------------------------
-- Permisos del panel
-- ---------------------------------------------------------------------------

alter table shipping_profiles enable row level security;

create policy admin_lee_perfiles_envio on shipping_profiles for select to authenticated
  using (is_admin());
create policy admin_edita_perfiles_envio on shipping_profiles for all to authenticated
  using (is_admin()) with check (is_admin());

revoke all on shipping_profiles from anon, authenticated;
grant select, insert, update, delete on shipping_profiles to authenticated;

-- Categorías: hasta acá el panel solo las leía. Puede cambiarles el perfil y
-- nada más.
create policy admin_edita_categorias on categories for update to authenticated
  using (is_admin()) with check (is_admin());
grant update (shipping_profile_id) on categories to authenticated;

-- Sin esto pasa lo de la 0010: guardar desde el detalle falla con 42501.
grant update (
  weight_grams, height_cm, width_cm, length_cm,
  dims_source, dims_url, dims_checked_at
) on products to authenticated;
