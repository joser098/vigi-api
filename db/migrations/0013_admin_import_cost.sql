-- El importador de la lista del proveedor vive en el panel y escribe `cost`
-- con el token del admin logueado.
--
-- La 0006 dejó `cost` afuera de los GRANT por columna, así que aplicar la
-- importación falla con 42501 "permission denied for table products".
--
-- Sigue restringido a admins por la policy admin_edita_productos (is_admin()).
-- `price` sigue afuera: lo calcula el trigger a partir de cost y margin_pct.

grant update (cost) on products to authenticated;
