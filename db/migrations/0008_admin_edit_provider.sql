-- El panel necesita poder editar la marca. No estaba en los GRANT del 0006.
--
-- `model` queda deliberadamente afuera: es la clave de las imágenes en R2
-- (gallery/<model>/0.png) y la URL del producto en la tienda
-- (/product/<model>). Cambiarlo desde el panel dejaría las fotos huérfanas y
-- rompería los enlaces existentes. Si alguna vez hay que renombrar un modelo,
-- va con un script que mueva también los objetos de R2.

grant update (provider) on products to authenticated;
