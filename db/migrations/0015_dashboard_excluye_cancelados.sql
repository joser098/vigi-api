-- Las ventas del dashboard no cuentan pedidos cancelados ni reembolsados.
--
-- Esa plata no entró (o se devolvió), así que sumarla infla la facturación, el
-- ticket promedio y las unidades vendidas por producto. Los estados se agregaron
-- en la 0014.
--
-- `create or replace` conserva los GRANT de la 0007 porque las columnas no cambian.

create or replace view admin_sales_by_month with (security_invoker = true) as
  select
    date_trunc('month', o.created_at)::date as month,
    count(*)                                as orders,
    sum(o.amount_paid)                      as revenue,
    avg(o.amount_paid)                      as avg_ticket
  from orders o
  where o.status not in ('cancelado', 'reembolsado')
  group by 1;

create or replace view admin_product_sales with (security_invoker = true) as
  select
    date_trunc('month', o.created_at)::date  as month,
    oi.product_id,
    oi.name,
    sum(oi.quantity)                         as units,
    sum(oi.quantity * oi.unit_price)         as revenue
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.status not in ('cancelado', 'reembolsado')
  group by 1, 2, 3;
