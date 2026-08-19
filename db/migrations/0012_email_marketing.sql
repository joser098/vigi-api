-- Email marketing administrado desde vigi-admin.
--
-- Tres tablas: a quién se le manda, qué se manda, y qué pasó con cada envío.
--
-- Quien manda es una Edge Function (`marketing-send`), no el navegador: la
-- API key de Resend no puede vivir en el bundle del panel. Es el mismo motivo
-- por el que existen `product-images` y `meli-price`.

-- ---------------------------------------------------------------------------
-- Contactos
-- ---------------------------------------------------------------------------

create table marketing_contacts (
  id              uuid primary key default gen_random_uuid(),

  -- citext: nadie quiere descubrir que le mandó dos veces al mismo humano
  -- porque una vez lo cargó con mayúscula.
  email           citext not null unique,
  name            text,

  -- De dónde salió: 'manual' lo cargó alguien en el panel, 'customer' vino de
  -- la tabla de clientes. Sirve para saber qué se puede depurar sin perder nada.
  source          text not null default 'manual',

  -- La baja NO borra la fila. Si se borrara, el contacto podría volver a
  -- entrar en la próxima importación y recibir lo que pidió no recibir.
  is_subscribed   boolean not null default true,
  unsubscribed_at timestamptz,

  -- Token del link de baja. Va en la URL, así que es un secreto por contacto:
  -- sin esto haría falta el email en la query string, que se filtra en logs y
  -- referers.
  unsubscribe_token uuid not null default gen_random_uuid() unique,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger marketing_contacts_set_updated_at
  before update on marketing_contacts
  for each row execute function set_updated_at();

create index marketing_contacts_suscriptos_idx
  on marketing_contacts (created_at desc) where is_subscribed;

-- ---------------------------------------------------------------------------
-- Campañas
-- ---------------------------------------------------------------------------

create table marketing_campaigns (
  id           uuid primary key default gen_random_uuid(),

  name         text not null,
  subject      text not null,
  from_name    text,
  html         text not null,

  -- 'draft' se puede editar y mandar; 'sent' ya salió. No hay vuelta atrás:
  -- un mail enviado no se edita, y dejar que se edite una campaña ya mandada
  -- haría que el registro dejara de describir lo que la gente recibió.
  status       text not null default 'draft'
                 check (status in ('draft', 'sending', 'sent', 'failed')),

  sent_at      timestamptz,
  sent_count   integer not null default 0,
  failed_count integer not null default 0,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger marketing_campaigns_set_updated_at
  before update on marketing_campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Envíos
-- ---------------------------------------------------------------------------
--
-- Una fila por destinatario. Es lo que permite reintentar una campaña sin
-- volver a escribirle a quien ya la recibió, y lo que contesta "¿le llegó?".

create table marketing_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references marketing_campaigns (id) on delete cascade,
  contact_id  uuid          references marketing_contacts (id) on delete set null,

  -- El email se copia además del contact_id: si el contacto se borra, tiene
  -- que seguir constando a quién se le mandó.
  email       citext not null,
  status      text not null check (status in ('sent', 'failed')),
  error       text,
  provider_id text,
  created_at  timestamptz not null default now(),

  -- Reintentar una campaña no le escribe dos veces al mismo contacto.
  constraint marketing_sends_unico unique (campaign_id, email)
);

create index marketing_sends_por_campana_idx on marketing_sends (campaign_id);

-- ---------------------------------------------------------------------------
-- Acceso del panel
-- ---------------------------------------------------------------------------

alter table marketing_contacts  enable row level security;
alter table marketing_campaigns enable row level security;
alter table marketing_sends     enable row level security;

create policy admin_lee_contactos on marketing_contacts for select to authenticated
  using (is_admin());
create policy admin_edita_contactos on marketing_contacts for all to authenticated
  using (is_admin()) with check (is_admin());

create policy admin_lee_campanas on marketing_campaigns for select to authenticated
  using (is_admin());
create policy admin_edita_campanas on marketing_campaigns for all to authenticated
  using (is_admin()) with check (is_admin());

-- Los envíos los escribe la Edge Function con service_role, que saltea RLS.
-- El panel solo los lee.
create policy admin_lee_envios on marketing_sends for select to authenticated
  using (is_admin());

revoke all on marketing_contacts, marketing_campaigns, marketing_sends
  from anon, authenticated;

grant select on marketing_contacts, marketing_campaigns, marketing_sends
  to authenticated;

grant delete on marketing_contacts, marketing_campaigns to authenticated;

-- `unsubscribe_token` queda afuera: lo genera la base y no hay razón para
-- tocarlo desde el panel. `is_subscribed` sí se puede editar, para poder dar
-- de baja a alguien que lo pidió por teléfono.
grant insert (email, name, source, is_subscribed) on marketing_contacts to authenticated;
grant update (email, name, source, is_subscribed, unsubscribed_at)
  on marketing_contacts to authenticated;

-- Los contadores y el estado los escribe la function cuando manda: si el panel
-- pudiera decir "sent" sin haber mandado nada, el registro no serviría.
grant insert (name, subject, from_name, html) on marketing_campaigns to authenticated;
grant update (name, subject, from_name, html) on marketing_campaigns to authenticated;
