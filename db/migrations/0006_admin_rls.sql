-- Acceso del panel de administración (vigi-admin).
--
-- El admin habla directo con Postgres vía supabase-js, así que TODA la
-- seguridad vive acá. Dos capas:
--
--   1. RLS      decide QUÉ FILAS ve cada rol
--   2. GRANT    decide QUÉ COLUMNAS puede tocar
--
-- La segunda importa tanto como la primera: sin ella, un admin podría escribir
-- `cost` o `price` a mano desde el navegador y romper el modelo de precios.
--
-- vigi-api NO se ve afectada: su connection string usa el rol `postgres`, que
-- es dueño de las tablas y saltea RLS por diseño. Las políticas de acá aplican
-- solo al rol `authenticated`, que es el que usa Supabase Auth.

-- ---------------------------------------------------------------------------
-- Whitelist
-- ---------------------------------------------------------------------------

create table admin_users (
  email      citext primary key,
  name       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- security definer para que pueda leer admin_users aunque el que pregunta no
-- tenga permiso de leerla. search_path fijo para que no se pueda secuestrar.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from admin_users
     where email = (auth.jwt() ->> 'email')::citext
       and is_active
  );
$$;

revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS en todo. Sin política, una tabla con RLS activo no se lee ni se escribe:
-- el default es negar, y se habilita solo lo necesario.
-- ---------------------------------------------------------------------------

alter table products            enable row level security;
alter table categories          enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;
alter table order_statuses      enable row level security;
alter table payment_orders      enable row level security;
alter table customers           enable row level security;
alter table addresses           enable row level security;
alter table carts               enable row level security;
alter table cart_items          enable row level security;
alter table product_favorites   enable row level security;
alter table verification_hashes enable row level security;
alter table provinces           enable row level security;
alter table carrusel_images     enable row level security;
alter table admin_users         enable row level security;

-- ---------------------------------------------------------------------------
-- Lectura: todo lo que el panel necesita mostrar
-- ---------------------------------------------------------------------------

create policy admin_lee_productos    on products          for select to authenticated using (is_admin());
create policy admin_lee_categorias   on categories        for select to authenticated using (is_admin());
create policy admin_lee_ordenes      on orders            for select to authenticated using (is_admin());
create policy admin_lee_items        on order_items       for select to authenticated using (is_admin());
create policy admin_lee_estados      on order_statuses    for select to authenticated using (is_admin());
create policy admin_lee_pagos        on payment_orders    for select to authenticated using (is_admin());
create policy admin_lee_clientes     on customers         for select to authenticated using (is_admin());
create policy admin_lee_direcciones  on addresses         for select to authenticated using (is_admin());
create policy admin_lee_provincias   on provinces         for select to authenticated using (is_admin());
create policy admin_lee_carrusel     on carrusel_images   for select to authenticated using (is_admin());

-- Cada admin se ve solo a sí mismo: la whitelist no se expone entera.
create policy admin_se_ve_a_si_mismo on admin_users for select to authenticated
  using (email = (auth.jwt() ->> 'email')::citext);

-- Carritos, favoritos y hashes no los necesita el panel: quedan sin política,
-- o sea inaccesibles desde el navegador.

-- ---------------------------------------------------------------------------
-- Escritura
-- ---------------------------------------------------------------------------

create policy admin_edita_productos on products for update to authenticated
  using (is_admin()) with check (is_admin());

create policy admin_edita_ordenes on orders for update to authenticated
  using (is_admin()) with check (is_admin());

create policy admin_edita_carrusel on carrusel_images for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Permisos por columna. Esto es lo que impide escribir cost o price a mano.
-- ---------------------------------------------------------------------------

revoke all on products, orders, order_items, customers, addresses,
              payment_orders, categories, order_statuses, provinces,
              carrusel_images, admin_users
  from anon, authenticated;

grant select on products, orders, order_items, customers, addresses,
                payment_orders, categories, order_statuses, provinces,
                carrusel_images, admin_users
  to authenticated;

-- price y cost quedan afuera a propósito:
--   cost  lo escribe el importador desde la lista del proveedor
--   price lo calcula el trigger a partir de cost, margin_pct y price_override
grant update (
  title, description, thumbnail, gallery,
  margin_pct, price_override,
  discount, has_promotion, is_active,
  category, location, power_type, is_analogue, tags,
  details, dvr_details, portero_details, alarm_details, storage_details, kit_details
) on products to authenticated;

grant update (status) on orders to authenticated;

grant insert, update, delete on carrusel_images to authenticated;

-- anon (el token público del navegador antes de loguearse) no puede nada.
