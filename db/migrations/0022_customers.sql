-- Clientes: métricas, segmentos y campañas por segmento.
--
-- Tres cosas:
--
--   1. Una vista de cada cliente con lo que importa para venderle: cuántas
--      veces compró, cuánto gastó, si tiene un carrito abierto, cuántos
--      favoritos. De ahí salen los segmentos ("recurrentes", "dormidos"…),
--      definidos acá y en ningún otro lado: el panel los muestra y
--      marketing-send los usa para elegir a quién mandarle.
--
--   2. Los clientes entran solos a la lista de email marketing, con baja en
--      cada mail. Hasta acá los contactos se cargaban a mano.
--
--   3. La antigüedad máxima de los carritos que entran al recupero pasa a ser
--      configurable. Era fija (el paso 3 más dos días, o sea 5 días) y dejaba
--      afuera carritos abandonados que sí se querían contactar.

-- ---------------------------------------------------------------------------
-- 1. Clientes
-- ---------------------------------------------------------------------------
--
-- Lee carritos y favoritos, que el panel no puede leer (0006), así que es
-- security definer y solo la ejecuta service_role. El panel entra por
-- `admin_customers()`, que exige ser admin.
--
-- Las órdenes canceladas o reembolsadas no cuentan como compra, igual que en
-- el dashboard (0015).

create or replace function customer_overview()
returns table (
  customer_id     uuid,
  email           citext,
  name            text,
  last_name       text,
  phone           text,
  is_guest        boolean,
  register_date   timestamptz,
  last_login      timestamptz,
  province        text,
  location        text,
  orders_count    integer,
  total_spent     numeric,
  avg_ticket      numeric,
  first_order_at  timestamptz,
  last_order_at   timestamptz,
  cart_units      integer,
  cart_amount     numeric,
  cart_updated_at timestamptz,
  favorites       integer,
  is_subscribed   boolean,
  segments        text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with compras as (
    select o.customer_id,
           count(*)::int      as orders_count,
           sum(o.amount_paid) as total_spent,
           min(o.created_at)  as first_order_at,
           max(o.created_at)  as last_order_at
      from orders o
     where o.status not in ('cancelado', 'reembolsado')
     group by o.customer_id
  ),
  carrito as (
    select c.customer_id,
           sum(ci.quantity)::int                as units,
           sum(ci.quantity * p.effective_price) as amount,
           c.updated_at
      from carts c
      join cart_items ci on ci.cart_id = c.id
      join products   p  on p.id = ci.product_id and p.is_active
     group by c.customer_id, c.updated_at
  ),
  favs as (
    select f.customer_id, count(*)::int as n
      from product_favorites f
     group by f.customer_id
  ),
  -- VIP = el 10% que más gastó entre los que compraron.
  umbral as (
    select percentile_cont(0.9) within group (order by total_spent) as vip
      from compras
  ),
  base as (
    select
      cu.id, cu.email, cu.name, cu.last_name, cu.phone,
      -- Los invitados se crean con un username `g_<hex>` (createGuest).
      cu.username like 'g\_%'               as is_guest,
      cu.register_date, cu.last_login,
      ad.province, ad.location,
      coalesce(k.orders_count, 0)           as orders_count,
      coalesce(k.total_spent, 0)            as total_spent,
      case when k.orders_count > 0
        then round(k.total_spent / k.orders_count) end as avg_ticket,
      k.first_order_at, k.last_order_at,
      coalesce(ca.units, 0)                 as cart_units,
      coalesce(ca.amount, 0)                as cart_amount,
      ca.updated_at                         as cart_updated_at,
      coalesce(fv.n, 0)                     as favorites,
      coalesce(m.is_subscribed, true)       as is_subscribed,
      coalesce(k.total_spent >= u.vip, false) as es_vip
    from customers cu
    cross join umbral u
    left join compras k  on k.customer_id = cu.id
    left join carrito ca on ca.customer_id = cu.id
    left join favs    fv on fv.customer_id = cu.id
    left join marketing_contacts m on m.email = cu.email
    left join lateral (
      select a.province, a.location
        from addresses a
       where a.customer_id = cu.id
       order by a.is_default desc, a.updated_at desc
       limit 1
    ) ad on true
  )
  select
    b.id, b.email, b.name, b.last_name, b.phone, b.is_guest,
    b.register_date, b.last_login, b.province, b.location,
    b.orders_count, b.total_spent, b.avg_ticket,
    b.first_order_at, b.last_order_at,
    b.cart_units, b.cart_amount, b.cart_updated_at,
    b.favorites, b.is_subscribed,
    array_remove(array[
      case when b.orders_count >= 2 then 'recurrentes' end,
      case when b.orders_count = 1  then 'una_compra' end,
      case when b.orders_count >= 1
            and b.last_order_at < now() - interval '90 days' then 'dormidos' end,
      case when b.orders_count = 0  then 'sin_compra' end,
      case when b.cart_units > 0    then 'carrito_abierto' end,
      case when b.favorites > 0     then 'con_favoritos' end,
      case when b.es_vip            then 'vip' end
    ], null)
  from base b
  order by b.total_spent desc, b.register_date desc;
$$;

revoke all on function customer_overview() from public, anon, authenticated;
grant execute on function customer_overview() to service_role;

create or replace function admin_customers()
returns table (
  customer_id     uuid,
  email           citext,
  name            text,
  last_name       text,
  phone           text,
  is_guest        boolean,
  register_date   timestamptz,
  last_login      timestamptz,
  province        text,
  location        text,
  orders_count    integer,
  total_spent     numeric,
  avg_ticket      numeric,
  first_order_at  timestamptz,
  last_order_at   timestamptz,
  cart_units      integer,
  cart_amount     numeric,
  cart_updated_at timestamptz,
  favorites       integer,
  is_subscribed   boolean,
  segments        text[]
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

  return query select * from customer_overview();
end;
$$;

revoke all on function admin_customers() from public, anon;
grant execute on function admin_customers() to authenticated;

-- El carrito y los favoritos de un cliente, para su ficha. Las órdenes, las
-- direcciones y los canjes el panel ya los puede leer directo.
create or replace function admin_customer_extras(p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'cart', (
      select jsonb_build_object(
        'updated_at', c.updated_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', p.id, 'model', p.model, 'title', p.title,
                   'thumbnail', p.thumbnail, 'quantity', ci.quantity,
                   'unit_price', p.effective_price, 'is_active', p.is_active
                 ) order by ci.added_at)
            from cart_items ci
            join products p on p.id = ci.product_id
           where ci.cart_id = c.id
        ), '[]'::jsonb)
      )
      from carts c where c.customer_id = p_customer
    ),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'model', p.model, 'title', p.title,
               'thumbnail', p.thumbnail, 'price', p.effective_price,
               'is_active', p.is_active, 'added_at', f.created_at
             ) order by f.created_at desc)
        from product_favorites f
        join products p on p.id = f.product_id
       where f.customer_id = p_customer
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function admin_customer_extras(uuid) from public, anon;
grant execute on function admin_customer_extras(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Los clientes, a la lista de email marketing
-- ---------------------------------------------------------------------------
--
-- Todos los clientes, registrados e invitados, con baja en cada mail. Si ya
-- estaban (cargados a mano o dados de baja), no se tocan: `do nothing`
-- respeta una baja anterior.

insert into marketing_contacts (email, name, source)
select cu.email, nullif(btrim(concat_ws(' ', cu.name, cu.last_name)), ''), 'customer'
  from customers cu
on conflict (email) do nothing;

-- Y los que se registren de acá en adelante. security definer porque quien
-- inserta en customers es la API, que no tiene por qué poder escribir la lista.
create or replace function customers_add_marketing_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into marketing_contacts (email, name, source)
  values (new.email, nullif(btrim(concat_ws(' ', new.name, new.last_name)), ''), 'customer')
  on conflict (email) do nothing;

  return null;
end;
$$;

create trigger customers_add_marketing_contact
  after insert on customers
  for each row execute function customers_add_marketing_contact();

-- ---------------------------------------------------------------------------
-- Campañas por segmento
-- ---------------------------------------------------------------------------

-- NULL = todos los suscriptos, como hasta ahora.
alter table marketing_campaigns
  add column segment text check (segment in (
    'recurrentes', 'una_compra', 'dormidos', 'sin_compra',
    'carrito_abierto', 'con_favoritos', 'vip'
  ));

grant insert (segment) on marketing_campaigns to authenticated;
grant update (segment) on marketing_campaigns to authenticated;

-- Los emails de un segmento, para marketing-send. Solo service_role: devuelve
-- emails de clientes, que es justo lo que no tiene que poder pedir cualquiera.
create or replace function marketing_segment_emails(p_segment text)
returns table (email citext)
language sql
stable
security definer
set search_path = public
as $$
  select o.email from customer_overview() o where p_segment = any (o.segments);
$$;

revoke all on function marketing_segment_emails(text) from public, anon, authenticated;
grant execute on function marketing_segment_emails(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Antigüedad de los carritos en el recupero
-- ---------------------------------------------------------------------------

alter table cart_recovery_settings
  add column max_cart_age_days integer not null default 5
    check (max_cart_age_days between 1 and 90);

-- Si la ventana fuera más corta que el paso 3, el cupón no saldría nunca.
alter table cart_recovery_settings
  add constraint cart_recovery_ventana_cubre_pasos
    check (max_cart_age_days * 24 > step3_hours);

grant update (max_cart_age_days) on cart_recovery_settings to authenticated;

-- Misma función que en 0021; lo único que cambia es la ventana.
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
    -- Hasta `max_cart_age_days` de antigüedad (antes era fijo: el paso 3
    -- más dos días). Más viejo que eso no aparece ni recibe mails.
    where c.updated_at > now() - make_interval(days => s.max_cart_age_days)
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
