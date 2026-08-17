-- Modelo de precios: costo del proveedor + margen + override.
--
-- El margen del 30% es una referencia, no una regla: a veces conviene vender
-- más caro o más barato según el mercado. Por eso no alcanza con guardar solo
-- el costo y calcular, ni con guardar solo el precio a mano.
--
--   cost           lo que paga VIGI (columna del sheet del proveedor)
--   margin_pct     margen a aplicar; 30 por defecto, ajustable por producto
--   price_override precio fijado a mano; NULL = usar el margen
--   price          resultado final, lo que lee toda la API
--
-- price lo mantiene un trigger y no una columna generada porque
-- effective_price (el precio con descuento) ya es generada, y en Postgres una
-- columna generada no puede referenciar a otra. Con el trigger, price es una
-- columna común y effective_price la sigue usando sin cambios.
--
-- Consecuencia práctica: actualizar cost recalcula price solo, salvo en los
-- productos con price_override, que quedan intactos. Eso es exactamente lo que
-- se necesita para reimportar la lista del proveedor sin pisar precios
-- decididos a mano.

alter table products
  add column cost           numeric(12,2) check (cost >= 0),
  add column margin_pct     numeric(5,2) not null default 30 check (margin_pct >= 0),
  add column price_override numeric(12,2) check (price_override >= 0);

comment on column products.cost is 'Costo del proveedor. Lo actualiza el importador.';
comment on column products.margin_pct is 'Margen de referencia sobre el costo. Default 30%.';
comment on column products.price_override is 'Precio fijado a mano. NULL = calcular desde cost y margin_pct.';

create or replace function set_product_price()
returns trigger
language plpgsql
as $$
begin
  if new.price_override is not null then
    new.price := new.price_override;
  elsif new.cost is not null then
    new.price := round(new.cost * (1 + new.margin_pct / 100));
  end if;

  return new;
end;
$$;

create trigger products_set_price
  before insert or update of cost, margin_pct, price_override on products
  for each row execute function set_product_price();

-- ---------------------------------------------------------------------------
-- Categorías que aparecen en la lista del proveedor y no existían
-- ---------------------------------------------------------------------------

insert into categories (name, label) values
  ('grabadores', 'Grabadores DVR/NVR'),
  ('redes',      'Redes y Conectividad'),
  ('cerraduras', 'Cerraduras Inteligentes'),
  ('accesos',    'Control de Acceso'),
  ('monitores',  'Monitores')
on conflict (name) do nothing;
