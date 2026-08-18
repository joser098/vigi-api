-- Precio de referencia de MercadoLibre, traído a demanda desde el admin.
--
-- No se consulta todo el catálogo: el admin pide el precio del producto que
-- está mirando y queda guardado hasta que alguien lo vuelva a pedir. Por eso
-- guardamos también cuándo se trajo: un precio de hace tres meses no sirve
-- para decidir, y sin la fecha no hay forma de saber que está viejo.

alter table products
  add column if not exists meli_price      numeric(12,2) check (meli_price >= 0),
  add column if not exists meli_url        text,
  add column if not exists meli_title      text,
  add column if not exists meli_checked_at timestamptz;

comment on column products.meli_price is
  'Publicación nueva más barata de vendedor con reputación, al momento de meli_checked_at.';
comment on column products.meli_title is
  'Título de esa publicación: sirve para darse cuenta cuando la búsqueda pescó otro producto.';

-- ---------------------------------------------------------------------------
-- Credenciales de MercadoLibre
--
-- MercadoLibre no tiene client_credentials: solo authorization_code y
-- refresh_token, y cada refresh devuelve un refresh_token NUEVO que invalida
-- al anterior. Por eso el token no puede vivir en una variable de entorno —
-- rota, y si no se persiste la rotación la integración se corta sola.
--
-- La fila la escribe únicamente la Edge Function con la service role key.
-- ---------------------------------------------------------------------------

create table if not exists meli_credentials (
  id            boolean primary key default true,
  access_token  text,
  refresh_token text        not null,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),

  -- Una sola fila, siempre.
  constraint meli_credentials_singleton check (id)
);

alter table meli_credentials enable row level security;

-- Sin políticas: nadie con anon key ni con JWT de admin puede leerla ni
-- escribirla. La service role saltea RLS, y es la única que la toca.
revoke all on table meli_credentials from anon, authenticated;
