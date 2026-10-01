-- Los mails de estado del pedido salen al confirmar, no por cron.
--
-- La 0024 los encolaba con un trigger y los mandaba una Edge Function por
-- cron a los 3 minutos. Se reemplaza por algo más simple: en el panel, el
-- cambio de estado abre un modal de confirmación ("¿Pasar a En camino? [x]
-- Mandarle un mail al cliente") y, al confirmar, la Edge Function
-- `order-notifications` cambia el estado y manda el mail en el momento.
--
-- Se mantiene de la 0024: la etiqueta "En camino" y las columnas de
-- seguimiento en `orders`. Se saca el trigger y la cola pasa a ser un
-- registro de lo que se mandó.
--
-- `order_notifications` se recrea: cuando se escribió esta migración estaba
-- vacía (nunca hubo cron que la procesara), así que no se pierde nada.

drop trigger if exists orders_enqueue_notification on orders;
drop function if exists enqueue_order_notification();
drop table if exists order_notifications;

-- ---------------------------------------------------------------------------
-- Registro de mails
-- ---------------------------------------------------------------------------
--
-- Qué se le mandó al cliente y cuándo. Lo escribe la Edge Function; el panel
-- lo lee para mostrarlo en el detalle de la orden y para avisar en el modal si
-- ese mail ya había salido.

create table order_notifications (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  status              text not null references order_statuses (code),
  email               text not null,
  sent_at             timestamptz not null default now(),
  -- NULL si falló; el error queda en `error`.
  provider_message_id text,
  error               text,
  -- Quién lo mandó (el email del admin).
  sent_by             text
);

create index order_notifications_order_idx on order_notifications (order_id, sent_at);

alter table order_notifications enable row level security;

create policy admin_lee_notificaciones on order_notifications for select to authenticated
  using (is_admin());

revoke all on order_notifications from anon, authenticated;
grant select on order_notifications to authenticated;
