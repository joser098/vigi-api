-- Estados para pedidos que no terminan en una entrega.
--
-- Ambos son finales: un pedido cancelado o reembolsado no vuelve a moverse.
-- El panel lee los estados de esta tabla, así que aparecen solos en el selector.

insert into order_statuses (code, label, sort_order, is_terminal) values
  ('cancelado',   'Cancelado',   5, true),
  ('reembolsado', 'Reembolsado', 6, true)
on conflict (code) do nothing;
