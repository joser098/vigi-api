-- Cupones de descuento, administrados desde vigi-admin.
--
-- Hasta acá el cupón era una constante en el frontend
-- (`OrderResume.tsx`: code = "MIDESCUENTO", 10%), o sea que cualquiera que
-- abriera el bundle lo leía, y el descuento se calculaba en el navegador y
-- viajaba en el body del pago. Esto lo mueve entero a la base.
--
-- La regla que ordena todo el diseño: **el descuento nunca llega en el
-- request**. El carrito guarda qué cupón se aplicó (`carts.coupon_id`) y
-- `createPaymentOrder` lo vuelve a validar y a calcular del lado del servidor,
-- igual que ya hace con los precios de los ítems.

-- ---------------------------------------------------------------------------
-- Cupones
-- ---------------------------------------------------------------------------

create type coupon_kind as enum ('percentage', 'fixed');

create table coupons (
  id               uuid primary key default gen_random_uuid(),

  -- citext para que "verano25" y "VERANO25" sean el mismo cupón: el cliente lo
  -- tipea a mano y no vamos a pelear con las mayúsculas.
  code             citext not null unique,
  description      text,

  kind             coupon_kind   not null,
  value            numeric(12,2) not null check (value > 0),

  -- Tope en pesos para los cupones por porcentaje. NULL = sin tope. Es lo que
  -- evita que un 20% sobre un kit de $2.000.000 regale $400.000.
  max_discount     numeric(12,2) check (max_discount > 0),

  -- Compra mínima (subtotal de productos, sin envío) para que aplique.
  min_purchase     numeric(12,2) not null default 0 check (min_purchase >= 0),

  -- NULL = ilimitado, en los dos casos.
  max_redemptions  integer check (max_redemptions > 0),
  max_per_customer integer check (max_per_customer > 0),

  -- Lo mantiene el trigger de coupon_redemptions. Está desnormalizado a
  -- propósito: el panel lista "usados / límite" sin un count por fila.
  redemptions      integer not null default 0,

  starts_at        timestamptz,
  ends_at          timestamptz,
  is_active        boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Un porcentaje es un porcentaje: sin esto, `kind = 'percentage'` con
  -- value = 5000 regalaba la tienda.
  constraint coupons_percentage_range
    check (kind <> 'percentage' or value between 1 and 100),

  -- El tope en pesos solo tiene sentido sobre un porcentaje.
  constraint coupons_max_discount_solo_porcentaje
    check (max_discount is null or kind = 'percentage'),

  constraint coupons_vigencia_coherente
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create trigger coupons_set_updated_at
  before update on coupons
  for each row execute function set_updated_at();

-- El listado del panel ordena por creación y filtra por activos.
create index coupons_activos_idx on coupons (created_at desc) where is_active;

comment on column coupons.value is
  'percentage: 1..100. fixed: monto en ARS a descontar.';
comment on column coupons.redemptions is
  'Contador derivado de coupon_redemptions. No escribir a mano.';

-- ---------------------------------------------------------------------------
-- Canjes
-- ---------------------------------------------------------------------------
--
-- Una fila por uso efectivo, escrita cuando la orden se crea (o sea, cuando el
-- pago se aprobó), no cuando el cliente escribe el código en el carrito. Es lo
-- que permite el límite por cliente y lo que da la trazabilidad de cuánto
-- descuento se entregó.

create table coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references coupons (id) on delete cascade,
  customer_id uuid          references customers (id) on delete set null,
  order_id    uuid          references orders (id) on delete set null,

  -- Cuánto se descontó realmente. El cupón puede cambiar después; esto no.
  amount      numeric(12,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),

  -- Un webhook que llega dos veces no cuenta dos canjes.
  constraint coupon_redemptions_orden_unica unique (coupon_id, order_id)
);

create index coupon_redemptions_por_cliente_idx
  on coupon_redemptions (coupon_id, customer_id);

create or replace function sync_coupon_redemptions()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update coupons set redemptions = redemptions + 1 where id = new.coupon_id;
  elsif tg_op = 'DELETE' then
    update coupons set redemptions = greatest(redemptions - 1, 0)
     where id = old.coupon_id;
  end if;

  return null;
end;
$$;

create trigger coupon_redemptions_sync
  after insert or delete on coupon_redemptions
  for each row execute function sync_coupon_redemptions();

-- ---------------------------------------------------------------------------
-- Enganche con carrito y orden
-- ---------------------------------------------------------------------------

-- El cupón vive en el carrito, no en el navegador. `on delete set null` para
-- que borrar un cupón no bloquee el checkout de quien lo tenía puesto: se
-- queda sin descuento, no sin carrito.
--
-- `coupon_discount` guarda cuánto se descontó al iniciar el pago. No es
-- redundante con el cupón: es el puente hasta el webhook, que llega después y
-- solo trae lo que le mandó la pasarela. Sin esto, la orden no tendría forma de
-- saber cuánto descuento se entregó ni con qué cupón.
alter table carts
  add column coupon_id       uuid references coupons (id) on delete set null,
  add column coupon_discount numeric(12,2) not null default 0
                             check (coupon_discount >= 0);

-- Retiro en oficina, por el mismo motivo que el cupón: era una opción que solo
-- existía en el navegador. El resumen mostraba "Envío: GRATIS" y
-- `createPaymentOrder` cobraba igual la tarifa de Andreani, porque nunca miró
-- el `shipments.local_pickup` que venía en el body — y hacía bien en no
-- mirarlo: nada que baje el precio puede llegar en el request.
alter table carts
  add column local_pickup boolean not null default false;

-- Snapshot en la orden: el código y el monto quedan congelados para el panel y
-- para cualquier reclamo posterior, aunque después se edite o borre el cupón.
alter table orders
  add column coupon_id   uuid references coupons (id) on delete set null,
  add column coupon_code citext,
  add column discount    numeric(12,2) not null default 0 check (discount >= 0);

comment on column orders.discount is
  'Descuento por cupón ya restado de amount_paid.';

-- ---------------------------------------------------------------------------
-- Acceso del panel (mismo modelo que 0006: RLS decide filas, GRANT columnas)
-- ---------------------------------------------------------------------------

alter table coupons            enable row level security;
alter table coupon_redemptions enable row level security;

create policy admin_lee_cupones on coupons for select to authenticated
  using (is_admin());

create policy admin_edita_cupones on coupons for all to authenticated
  using (is_admin()) with check (is_admin());

-- Solo lectura: los canjes los escribe la API cuando se aprueba un pago.
create policy admin_lee_canjes on coupon_redemptions for select to authenticated
  using (is_admin());

revoke all on coupons, coupon_redemptions from anon, authenticated;

grant select on coupons, coupon_redemptions to authenticated;
grant delete on coupons to authenticated;

-- `redemptions` queda afuera de los dos grants a propósito: es un contador
-- derivado, lo mantiene el trigger. Si el panel pudiera escribirlo, el límite
-- de usos sería decorativo.
grant insert (
  code, description, kind, value, max_discount, min_purchase,
  max_redemptions, max_per_customer, starts_at, ends_at, is_active
) on coupons to authenticated;

grant update (
  code, description, kind, value, max_discount, min_purchase,
  max_redemptions, max_per_customer, starts_at, ends_at, is_active
) on coupons to authenticated;
