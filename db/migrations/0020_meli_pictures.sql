-- Fotos propias de la publicación de MercadoLibre.
--
-- Por defecto la publicación usa la galería del producto (la misma de
-- vigi.com.ar). Algunas fotos son demasiado chicas para MercadoLibre (pide
-- 500 × 500 como mínimo) y la publicación queda en revisión. Para esos casos
-- se pueden usar las fotos de la ficha del catálogo de MercadoLibre, que ya
-- están en sus servidores y se referencian por id.
--
-- Solo afecta a MercadoLibre: la galería del producto y la tienda no cambian.
--
-- Formato: [{"id": "123456-MLA..."}]. NULL o vacío = usar la galería.

alter table meli_listings add column pictures jsonb;

grant update (pictures) on meli_listings to authenticated;
