-- El frontend (vigi-app, services/types.ts) declara seis fichas técnicas por
-- producto, una por familia. El schema inicial solo tenía details y
-- dvr_details, así que cargar el catálogo real habría perdido la ficha de
-- porteros, alarmas, almacenamiento y kits en silencio.
--
-- Columnas separadas y no un solo blob: son formas genuinamente distintas, cada
-- producto usa una o dos, y así la API las devuelve como campos de primer nivel
-- igual que hoy. Una columna jsonb nula no ocupa espacio.

alter table products
  add column portero_details jsonb,
  add column alarm_details   jsonb,
  add column storage_details jsonb,
  add column kit_details     jsonb;

-- Campos que también declara la interfaz Product y no estaban.
alter table products
  add column description text,
  add column others       text,
  add column gallery      integer not null default 0;

comment on column products.details is
  'Ficha técnica de cámara. Solo lectura, la consulta no filtra por acá.';
comment on column products.gallery is
  'Cantidad de imágenes adicionales en el bucket, no una URL.';
