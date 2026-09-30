-- Cuotas sin interés en MercadoLibre.
--
-- En Argentina las cuotas sin interés dependen del tipo de publicación y de
-- una campaña:
--
--   none  gold_special (Clásica), sin cuotas sin interés
--   3x    gold_pro + tag 3x_campaign: 3 cuotas sin interés al mismo precio
--   6x    gold_pro sin tag: 6 cuotas sin interés, lo que Premium da por defecto
--
-- Cada opción tiene su comisión (la de 3x y 6x suma un cargo por financiar las
-- cuotas), y la function la consulta con la campaña incluida para que el
-- precio mantenga la ganancia.
--
-- 3x solo existe para cuentas y categorías habilitadas por MercadoLibre: la
-- function lo verifica antes de activarlo.

alter table meli_settings
  add column installments text not null default 'none'
    check (installments in ('none', '3x', '6x'));

-- NULL = usar el de la configuración.
alter table meli_listings
  add column installments text
    check (installments in ('none', '3x', '6x'));

grant update (installments) on meli_settings to authenticated;

-- En una publicación ya hecha, cambiar las cuotas cambia el tipo de
-- publicación y el precio en MercadoLibre: eso lo hace la function. El panel
-- solo puede elegirlas en las que todavía no se publicaron (la function lo
-- controla igual).
grant update (installments) on meli_listings to authenticated;
