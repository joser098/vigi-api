-- Mails automáticos al cambiar el estado de un pedido, y "Enviado" pasa a
-- llamarse "En camino".
--
-- REEMPLAZADA EN PARTE POR LA 0025: la cola, el trigger y el envío a los 3
-- minutos por cron se sacaron, y el mail sale al confirmar el cambio de
-- estado en un modal del panel. Este archivo queda como se aplicó.
--
-- Cómo funcionaba:
--
--   1. Un trigger en `orders` anota cada cambio de estado que avisa algo en
--      `order_notifications`, con `send_after` = ahora + 3 minutos.
--   2. La Edge Function `order-notifications` corre por cron cada minuto,
--      toma lo que ya venció y manda el mail, SOLO si el pedido sigue en ese
--      estado.

-- ---------------------------------------------------------------------------
-- "Enviado" → "En camino"
-- ---------------------------------------------------------------------------
--
-- Cambia solo la etiqueta. El código sigue siendo `enviado`: lo usan el panel,
-- la API, el enum de Zod y las órdenes que ya existen.

update order_statuses set label = 'En camino' where code = 'enviado';

-- ---------------------------------------------------------------------------
-- Seguimiento del envío
-- ---------------------------------------------------------------------------

alter table orders
  add column carrier         text,
  add column tracking_number text,
  add column tracking_url    text check (tracking_url is null or tracking_url ~* '^https?://');

grant update (carrier, tracking_number, tracking_url) on orders to authenticated;

-- ---------------------------------------------------------------------------
-- Cola de mails
-- ---------------------------------------------------------------------------

create table order_notifications (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  status              text not null references order_statuses (code),

  created_at          timestamptz not null default now(),
  send_after          timestamptz not null default now() + interval '3 minutes',

  sent_at             timestamptz,
  provider_message_id text,

  skipped_at          timestamptz,
  skip_reason         text,

  attempts            smallint not null default 0,
  last_error          text,

  constraint order_notifications_unique unique (order_id, status)
);

create index order_notifications_pending_idx
  on order_notifications (send_after)
  where sent_at is null and skipped_at is null;

create or replace function enqueue_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('enviado', 'entregado', 'cancelado', 'reembolsado') then
    insert into order_notifications (order_id, status)
    values (new.id, new.status)
    on conflict (order_id, status) do update
      set send_after  = now() + interval '3 minutes',
          skipped_at  = null,
          skip_reason = null,
          attempts    = 0,
          last_error  = null
      where order_notifications.sent_at is null;
  end if;
  return new;
end;
$$;

create trigger orders_enqueue_notification
  after update of status on orders
  for each row execute function enqueue_order_notification();

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

alter table order_notifications enable row level security;

create policy admin_lee_notificaciones on order_notifications for select to authenticated
  using (is_admin());

revoke all on order_notifications from anon, authenticated;
grant select on order_notifications to authenticated;
