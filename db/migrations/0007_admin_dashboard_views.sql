-- Vistas de agregados para el dashboard del panel.
--
-- security_invoker = true es lo que hace que esto sea seguro. Por defecto una
-- vista corre con los permisos de quien la creó, así que saltearía el RLS de
-- las tablas de abajo y cualquiera con sesión vería las ventas. Con
-- security_invoker corre con los permisos de quien consulta, y las políticas
-- de orders y order_items siguen mandando.

create view admin_sales_by_month with (security_invoker = true) as
  select
    date_trunc('month', o.created_at)::date as month,
    count(*)                                as orders,
    sum(o.amount_paid)                      as revenue,
    avg(o.amount_paid)                      as avg_ticket
  from orders o
  group by 1;

create view admin_product_sales with (security_invoker = true) as
  select
    date_trunc('month', o.created_at)::date  as month,
    oi.product_id,
    oi.name,
    sum(oi.quantity)                         as units,
    sum(oi.quantity * oi.unit_price)         as revenue
  from order_items oi
  join orders o on o.id = oi.order_id
  group by 1, 2, 3;

-- Estado del catálogo: sirve para saber cuánto falta cargar.
create view admin_catalogue_health with (security_invoker = true) as
  select
    count(*)                                          as total,
    count(*) filter (where is_active)                 as activos,
    count(*) filter (where thumbnail is null)         as sin_foto,
    count(*) filter (where has_promotion)             as en_promocion,
    count(*) filter (where price_override is not null) as con_precio_manual,
    count(*) filter (where cost is null)              as sin_costo
  from products;

grant select on admin_sales_by_month, admin_product_sales, admin_catalogue_health
  to authenticated;
