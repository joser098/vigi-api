-- El panel necesita poder cargar el precio de referencia de MercadoLibre.
--
-- La 0009 agregó las columnas pero no las sumó a los GRANT del 0006, que dan
-- update por lista explícita de columnas. Sin esto, guardar desde el detalle
-- falla con 42501 "permission denied for table products".
--
-- `meli_title` queda afuera: hoy el panel no lo escribe. Lo llenaría la Edge
-- Function, que corre con service role y no pasa por estos grants.

grant update (meli_price, meli_url, meli_checked_at) on products to authenticated;
