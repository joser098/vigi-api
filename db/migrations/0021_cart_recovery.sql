-- Recupero de carritos abandonados.
--
-- Un carrito con productos que nadie toca hace horas y que no terminó en una
-- orden recibe hasta tres mails: un recordatorio, uno con los beneficios de
-- comprar en VIGI y, al final, un cupón personal. Los manda la Edge Function
-- `cart-recovery`, que corre por cron cada hora.
--
-- La parte delicada es el cupón: tiene que ser **de una sola persona** y no
-- puede comerse la ganancia. Por eso el porcentaje no es fijo: se calcula por
-- carrito, contra el costo real de lo que tiene adentro, y nunca deja la
-- ganancia neta por debajo de `min_net_margin_pct`. Esa cuenta vive en una sola
-- función (`cart_recovery_quote`) que usan el envío y el panel, para que lo que
-- el panel dice que cuesta un cupón sea lo que efectivamente se regala.

-- ---------------------------------------------------------------------------
-- Cupones personales
-- ---------------------------------------------------------------------------

-- `customer_id` NULL = cupón público, como todos los que había. Con un cliente,
-- solo ese cliente lo puede aplicar: lo valida `services/coupons.js` en el
-- carrito y otra vez en el checkout.
--
-- `origin` separa los cupones que crea alguien en el panel de los que genera
-- el recupero, que son cientos y de un solo uso: el listado de Cupones y el
-- selector de Email marketing muestran solo los manuales.
alter table coupons
  add column customer_id uuid references customers (id) on delete cascade,
  add column origin      text not null default 'manual'
                         check (origin in ('manual', 'cart_recovery'));

create index coupons_por_cliente_idx on coupons (customer_id)
  where customer_id is not null;

comment on column coupons.customer_id is
  'NULL = cupón público. Con valor, solo ese cliente lo puede aplicar.';

-- Las dos columnas quedan fuera de los GRANT de 0011: desde el panel no se
-- crean cupones personales. Los crea la function con service_role.

-- ---------------------------------------------------------------------------
-- Configuración
-- ---------------------------------------------------------------------------

create table cart_recovery_settings (
  id                   boolean primary key default true,

  -- Arranca apagado: los mails empiezan a salir recién cuando alguien lo
  -- prende desde el panel, no cuando se corre esta migración.
  is_active            boolean not null default false,

  -- Horas desde la última vez que se tocó el carrito hasta cada mail.
  step1_hours          integer not null default 2  check (step1_hours > 0),
  step2_hours          integer not null default 24 check (step2_hours > 0),
  step3_hours          integer not null default 72 check (step3_hours > 0),

  -- Lo que se queda la pasarela sobre lo que paga el cliente. Es el mismo 7%
  -- que usa el panel para el margen neto de cada producto (`lib/comision.ts`).
  gateway_fee_pct      numeric(5,2) not null default 7
                         check (gateway_fee_pct >= 0 and gateway_fee_pct < 50),

  -- La ganancia neta sobre el costo que tiene que quedar DESPUÉS del cupón.
  -- Es el piso que decide el porcentaje: un carrito con mucho margen recibe
  -- hasta `max_discount_pct`; uno con poco recibe menos, o nada.
  min_net_margin_pct   numeric(5,2) not null default 15 check (min_net_margin_pct >= 0),

  max_discount_pct     numeric(5,2) not null default 10
                         check (max_discount_pct > 0 and max_discount_pct <= 30),

  -- Debajo de esto no vale la pena ofrecer cupón: un 1% no mueve a nadie y
  -- se lee como un chiste. El tercer mail no sale.
  min_discount_pct     numeric(5,2) not null default 3 check (min_discount_pct > 0),

  coupon_valid_hours   integer not null default 48 check (coupon_valid_hours > 0),

  -- Un cliente recibe como mucho un cupón de recupero cada tantos días. Sin
  -- esto, armar y abandonar un carrito sería una máquina de cupones.
  coupon_cooldown_days integer not null default 90 check (coupon_cooldown_days >= 0),

  -- Tope de mails de recupero por día, aparte de la cuota de los proveedores.
  daily_limit          integer not null default 30 check (daily_limit >= 0),

  updated_at           timestamptz not null default now(),

  constraint cart_recovery_settings_singleton check (id),
  constraint cart_recovery_pasos_en_orden
    check (step1_hours < step2_hours and step2_hours < step3_hours),
  constraint cart_recovery_descuento_coherente
    check (min_discount_pct <= max_discount_pct)
);

create trigger cart_recovery_settings_set_updated_at
  before update on cart_recovery_settings
  for each row execute function set_updated_at();

insert into cart_recovery_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Envíos
-- ---------------------------------------------------------------------------
--
-- Una fila por mail (o por mail que se decidió no mandar). Es lo que hace que
-- la function sea idempotente y lo que contesta "¿cuánto recuperamos?".
--
-- `cart_updated_at` identifica el *episodio*: el carrito tal como estaba
-- cuando se abandonó. Si el cliente lo vuelve a tocar, `carts.updated_at`
-- cambia y la secuencia arranca de cero para ese carrito nuevo.

create table cart_recovery_sends (
  id                uuid primary key default gen_random_uuid(),
  cart_id           uuid not null references carts (id) on delete cascade,
  customer_id       uuid          references customers (id) on delete set null,
  email             citext not null,

  step              smallint not null check (step between 1 and 3),
  cart_updated_at   timestamptz not null,

  -- Foto del carrito al momento del mail. Los precios cambian; esto no.
  cart_amount       numeric(12,2) not null,
  cart_cost         numeric(12,2),
  margin_before_pct numeric(7,2),

  -- Solo en el paso 3.
  coupon_id         uuid references coupons (id) on delete set null,
  discount_pct      numeric(5,2),
  discount_amount   numeric(12,2),
  margin_after_pct  numeric(7,2),

  -- 'pending' = reservado por una corrida que lo está mandando: la fila se
  -- escribe ANTES de mandar, y la unique de abajo hace que dos corridas
  -- simultáneas (el cron y el botón del panel) no manden el mismo mail.
  -- 'skipped' = se decidió no mandarlo (sin margen para un cupón, cupón
  -- reciente). 'failed' = el proveedor lo rechazó.
  --
  -- Los cuatro cierran el paso: no se reintenta. Un mail que falla no se
  -- vuelve a probar cada hora (con un cupón nuevo cada vez); la secuencia
  -- sigue con el paso siguiente.
  status            text not null
                      check (status in ('pending', 'sent', 'failed', 'skipped')),
  error             text,
  provider          text check (provider in ('resend', 'unitpost')),
  provider_id       text,
  created_at        timestamptz not null default now(),

  constraint cart_recovery_sends_unico unique (cart_id, cart_updated_at, step)
);

create index cart_recovery_sends_por_fecha_idx on cart_recovery_sends (created_at desc);
create index cart_recovery_sends_cuota_idx on cart_recovery_sends (provider, created_at)
  where status = 'sent';

-- ---------------------------------------------------------------------------
-- Cuota de mails compartida
-- ---------------------------------------------------------------------------
--
-- Campañas y recupero salen por los mismos proveedores con la misma cuota
-- diaria (ver marketing-send). Si cada uno contara solo lo suyo, entre los dos
-- se pasarían y se llevarían puestos los mails de confirmación de compra.

create view email_quota_sends with (security_invoker = true) as
  select provider, created_at from marketing_sends     where status = 'sent'
  union all
  select provider, created_at from cart_recovery_sends where status = 'sent';

-- ---------------------------------------------------------------------------
-- Cuánto descuento aguanta un carrito
-- ---------------------------------------------------------------------------
--
-- Con R = lo que paga el cliente, C = el costo, f = comisión de la pasarela y
-- m = la ganancia neta mínima sobre el costo:
--
--   ganancia después del cupón = R·(1−d)·(1−f) − C  ≥  m·C
--   ⇒  d ≤ 1 − C·(1+m) / (R·(1−f))
--
-- El porcentaje es ese máximo, redondeado hacia abajo y con tope en
-- `max_discount_pct`. Si no llega a `min_discount_pct`, no hay cupón.
--
-- Mismas definiciones que el panel (`lib/comision.ts`): la comisión se cobra
-- sobre el precio y el margen se mide sobre el costo. Un carrito con algún
-- producto sin costo cargado no tiene cupón: sin costo no hay forma de saber
-- cuánto se regala.

create or replace function cart_recovery_quote(p_amount numeric, p_cost numeric)
returns table (
  margin_before_pct numeric,
  discount_pct      numeric,
  discount_amount   numeric,
  margin_after_pct  numeric
)
language sql
stable
as $$
  with s as (select * from cart_recovery_settings where id),
  base as (
    select
      p_amount as r,
      p_cost   as c,
      s.gateway_fee_pct / 100    as f,
      s.min_net_margin_pct / 100 as m,
      s.max_discount_pct,
      s.min_discount_pct
    from s
  ),
  calc as (
    select *,
      case when c > 0 and r > 0
        then least(max_discount_pct, floor((1 - c * (1 + m) / (r * (1 - f))) * 100))
      end as pct
    from base
  ),
  final as (
    select *, case when pct >= min_discount_pct then pct end as pct_ok from calc
  )
  select
    case when c > 0 then round((r * (1 - f) - c) / c * 100, 1) end,
    pct_ok,
    case when pct_ok is not null then round(r * pct_ok / 100) end,
    case when pct_ok is not null
      then round((r * (1 - pct_ok / 100) * (1 - f) - c) / c * 100, 1) end
  from final;
$$;

-- ---------------------------------------------------------------------------
-- Carritos abandonados
-- ---------------------------------------------------------------------------
--
-- Todos los carritos abiertos que entran en la ventana de recupero, con lo que
-- toca hacer con cada uno. La usan la function (las filas con `due`) y el
-- panel (todas).
--
-- Afuera quedan:
--   - los que ya terminaron en una orden después de la última modificación
--     (el carrito se vacía con el pago aprobado, pero por si algún camino no
--     lo vacía: escribirle "te olvidaste esto" a quien ya pagó es lo peor que
--     puede hacer esta función);
--   - los que tienen puesto un cupón de recupero todavía vigente: ya están
--     en el paso final;
--   - los productos desactivados, que no se muestran ni se cuentan.

create or replace function cart_recovery_open_carts()
returns table (
  cart_id           uuid,
  customer_id       uuid,
  email             citext,
  name              text,
  last_name         text,
  cart_updated_at   timestamptz,
  units             bigint,
  amount            numeric,
  cost              numeric,
  items             jsonb,
  last_step         smallint,
  last_sent_at      timestamptz,
  next_step         integer,
  due               boolean,
  unsubscribed      boolean,
  coupon_blocked    boolean,
  margin_before_pct numeric,
  discount_pct      numeric,
  discount_amount   numeric,
  margin_after_pct  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from cart_recovery_settings where id),
  carritos as (
    select
      c.id, c.customer_id, c.updated_at,
      cu.email, cu.name, cu.last_name,
      sum(ci.quantity)                     as units,
      sum(ci.quantity * p.effective_price) as amount,
      case when bool_and(coalesce(p.cost, 0) > 0)
        then sum(ci.quantity * p.cost) end as cost,
      jsonb_agg(
        jsonb_build_object(
          'id',             p.id,
          'model',          p.model,
          'title',          p.title,
          'thumbnail',      p.thumbnail,
          'quantity',       ci.quantity,
          'unit_price',     p.effective_price,
          'price_original', case
            when p.has_promotion and p.discount between 1 and 50 then p.price end
        )
        order by ci.added_at
      ) as items
    from carts c
    cross join s
    join customers  cu on cu.id = c.customer_id
    join cart_items ci on ci.cart_id = c.id
    join products   p  on p.id = ci.product_id and p.is_active
    left join coupons cp on cp.id = c.coupon_id
    -- Hasta dos días después del último paso: más viejo que eso ya no se
    -- recupera, y al prender la función no le escribe a carritos de hace meses.
    where c.updated_at > now() - make_interval(hours => s.step3_hours + 48)
      and not exists (
        select 1 from orders o
         where o.customer_id = c.customer_id
           and o.created_at > c.updated_at
      )
      -- coalesce: sin cupón en el carrito la comparación da NULL, y un
      -- `not NULL` dejaría afuera justo a los carritos sin cupón.
      and not coalesce(
        cp.origin = 'cart_recovery' and (cp.ends_at is null or cp.ends_at > now()),
        false
      )
    group by c.id, cu.id
  ),
  enviados as (
    select e.cart_id, e.cart_updated_at,
           max(e.step)       as last_step,
           max(e.created_at) as last_sent_at
      from cart_recovery_sends e
     group by e.cart_id, e.cart_updated_at
  ),
  armado as (
    select k.*,
      e.last_step,
      e.last_sent_at,
      case when coalesce(e.last_step, 0) < 3 then coalesce(e.last_step, 0) + 1 end as next_step,
      exists (
        select 1 from marketing_contacts m
         where m.email = k.email and not m.is_subscribed
      ) as unsubscribed,
      exists (
        select 1 from coupons x
         where x.customer_id = k.customer_id
           and x.origin = 'cart_recovery'
           and x.created_at > now() - make_interval(days => s.coupon_cooldown_days)
      ) as coupon_blocked,
      s.step1_hours, s.step2_hours, s.step3_hours
    from carritos k
    cross join s
    left join enviados e on e.cart_id = k.id and e.cart_updated_at = k.updated_at
  )
  select
    a.id, a.customer_id, a.email, a.name, a.last_name, a.updated_at,
    a.units, a.amount, a.cost, a.items,
    a.last_step, a.last_sent_at, a.next_step,
    a.next_step is not null
      and not a.unsubscribed
      and now() - a.updated_at >= make_interval(hours => case a.next_step
            when 1 then a.step1_hours
            when 2 then a.step2_hours
            else a.step3_hours end)
      -- Al menos 12 h entre un mail y el siguiente, aunque el carrito sea
      -- viejo: el día que se prende la función, un carrito de hace 30 h no
      -- recibe el 1 y el 2 en la misma corrida.
      and (a.last_sent_at is null or now() - a.last_sent_at >= interval '12 hours')
      as due,
    a.unsubscribed,
    a.coupon_blocked,
    q.margin_before_pct, q.discount_pct, q.discount_amount, q.margin_after_pct
  from armado a
  cross join lateral cart_recovery_quote(a.amount, a.cost) q
  order by a.updated_at desc;
$$;

-- Lee carritos, que el panel no puede leer (0006): es security definer y por
-- eso no se le da a nadie más que a service_role. El panel entra por el
-- envoltorio de abajo, que exige ser admin.
revoke all on function cart_recovery_open_carts() from public, anon, authenticated;
grant execute on function cart_recovery_open_carts() to service_role;

-- El panel entra por acá: misma consulta, pero exige ser admin.
create function admin_cart_recovery_open_carts()
returns table (
  cart_id           uuid,
  customer_id       uuid,
  email             citext,
  name              text,
  last_name         text,
  cart_updated_at   timestamptz,
  units             bigint,
  amount            numeric,
  cost              numeric,
  items             jsonb,
  last_step         smallint,
  last_sent_at      timestamptz,
  next_step         integer,
  due               boolean,
  unsubscribed      boolean,
  coupon_blocked    boolean,
  margin_before_pct numeric,
  discount_pct      numeric,
  discount_amount   numeric,
  margin_after_pct  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query select * from cart_recovery_open_carts();
end;
$$;

revoke all on function admin_cart_recovery_open_carts() from public, anon;
grant execute on function admin_cart_recovery_open_carts() to authenticated;

-- ---------------------------------------------------------------------------
-- Resultados
-- ---------------------------------------------------------------------------
--
-- Un episodio por fila: cuántos mails recibió, qué cupón se le dio y si
-- terminó en compra. "Recuperado" = el cliente compró dentro de los 10 días
-- siguientes al primer mail. Es atribución generosa (pudo haber comprado
-- igual), por eso se muestra aparte si usó el cupón.

create view admin_cart_recovery_episodes with (security_invoker = true) as
with ep as (
  select
    s.cart_id,
    s.cart_updated_at,
    s.customer_id,
    min(s.email)                                         as email,
    max(s.cart_amount)                                   as cart_amount,
    max(s.margin_before_pct)                             as margin_before_pct,
    max(s.step) filter (where s.status = 'sent')         as last_step,
    min(s.created_at) filter (where s.status = 'sent')   as first_sent_at,
    max(s.created_at)                                    as last_activity_at,
    (array_agg(s.coupon_id) filter (where s.coupon_id is not null))[1] as coupon_id,
    max(s.discount_pct)                                  as discount_pct,
    max(s.discount_amount)                               as discount_amount,
    max(s.margin_after_pct)                              as margin_after_pct,
    bool_or(s.status = 'failed')                         as had_failures
  from cart_recovery_sends s
  group by s.cart_id, s.cart_updated_at, s.customer_id
)
select
  ep.*,
  cu.name, cu.last_name,
  cp.code              as coupon_code,
  cp.ends_at           as coupon_ends_at,
  o.id                 as order_id,
  o.amount_paid        as order_amount,
  o.discount           as order_discount,
  o.created_at         as order_created_at,
  (o.id is not null and o.coupon_id = ep.coupon_id) as used_coupon
from ep
left join customers cu on cu.id = ep.customer_id
left join coupons   cp on cp.id = ep.coupon_id
left join lateral (
  select o.id, o.amount_paid, o.discount, o.created_at, o.coupon_id
    from orders o
   where ep.first_sent_at is not null
     and o.customer_id = ep.customer_id
     and o.created_at > ep.first_sent_at
     and o.created_at < ep.first_sent_at + interval '10 days'
     and o.status not in ('cancelado', 'reembolsado')
   order by o.created_at
   limit 1
) o on true;

-- ---------------------------------------------------------------------------
-- Acceso del panel
-- ---------------------------------------------------------------------------

alter table cart_recovery_settings enable row level security;
alter table cart_recovery_sends    enable row level security;

create policy admin_lee_recupero_config on cart_recovery_settings for select to authenticated
  using (is_admin());
create policy admin_edita_recupero_config on cart_recovery_settings for update to authenticated
  using (is_admin()) with check (is_admin());

-- Los envíos los escribe la function con service_role. El panel solo los lee.
create policy admin_lee_recupero_envios on cart_recovery_sends for select to authenticated
  using (is_admin());

revoke all on cart_recovery_settings, cart_recovery_sends from anon, authenticated;
grant select on cart_recovery_settings, cart_recovery_sends to authenticated;

grant update (
  is_active, step1_hours, step2_hours, step3_hours, gateway_fee_pct,
  min_net_margin_pct, max_discount_pct, min_discount_pct,
  coupon_valid_hours, coupon_cooldown_days, daily_limit
) on cart_recovery_settings to authenticated;

revoke all on email_quota_sends, admin_cart_recovery_episodes from anon;
grant select on email_quota_sends, admin_cart_recovery_episodes to authenticated;

-- La cotización no lee nada privado (solo la configuración), pero no hay
-- motivo para exponerla a anon.
revoke all on function cart_recovery_quote(numeric, numeric) from public, anon;
grant execute on function cart_recovery_quote(numeric, numeric) to authenticated, service_role;
