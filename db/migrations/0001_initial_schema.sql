-- VIGI API - Initial Postgres schema (Supabase)

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive email
create extension if not exists pg_trgm;    -- substring search on titles and models

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type verification_reason as enum (
  'register',
  'reset-password'
);

create type payment_gateway as enum (
  'mercadopago',
  'nave'
);

create type product_location as enum (
  'interior',
  'exterior'
);

-- ---------------------------------------------------------------------------
-- Shared trigger
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------

create table customers (
  id                  uuid primary key default gen_random_uuid(),

  username            text        not null,
  email               citext      not null,
  password            text        not null,
  profile_image       text        not null default '',

  name                text        not null,
  last_name           text        not null,
  phone               text,
  dni                 text,

  conditions_accepted boolean     not null default false,
  has_order_active    boolean     not null default false,
  is_active           boolean     not null default false,

  register_date       timestamptz not null default now(),
  last_login          timestamptz,
  updated_at          timestamptz not null default now(),

  constraint customers_email_key unique (email),
  constraint customers_username_key unique (username)
);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Addresses (one per customer today, ready for several)
-- ---------------------------------------------------------------------------

create table addresses (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers (id) on delete cascade,

  province       text not null,
  location       text not null,
  address_name   text not null,
  address_number text not null,
  department     text,
  zip_code       text not null,

  is_default     boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index addresses_customer_id_idx on addresses (customer_id);
create unique index addresses_one_default_per_customer
  on addresses (customer_id) where is_default;

create trigger addresses_set_updated_at
  before update on addresses
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

create table categories (
  name       text primary key,
  label      text not null,
  is_active  boolean not null default true
);

create table products (
  id              uuid primary key default gen_random_uuid(),

  model           text    not null,
  title           text    not null,
  price           numeric(12,2) not null check (price >= 0),
  discount        smallint not null default 0 check (discount between 0 and 100),
  has_promotion   boolean not null default false,
  is_active       boolean not null default true,

  thumbnail       text,
  provider        text,
  category        text    not null references categories (name),
  tags            text[]  not null default '{}',

  -- browse facets: promoted to columns because every listing filters on them
  location        product_location,
  power_type      text,
  is_analogue     boolean not null default false,

  -- display-only spec sheet, heterogeneous per category
  details         jsonb   not null default '{}'::jsonb,
  dvr_details     jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint products_model_key unique (model)
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- Every read path filters on is_active.
create index products_active_category_idx
  on products (category) where is_active;
create index products_promotion_idx
  on products (price) where is_active and has_promotion;
create index products_provider_idx
  on products (provider, category) where is_active;

-- Case-insensitive substring search over model, title and tags.
create index products_title_trgm_idx on products using gin (title gin_trgm_ops);
create index products_model_trgm_idx on products using gin (model gin_trgm_ops);
create index products_tags_idx       on products using gin (tags);

-- Browse facets.
create index products_location_idx   on products (location)   where is_active;
create index products_power_type_idx on products (power_type) where is_active;
create index products_analogue_idx   on products (id) where is_active and is_analogue;

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------

create table product_favorites (
  product_id  uuid not null references products (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  created_at  timestamptz not null default now(),

  primary key (product_id, customer_id)
);

create index product_favorites_customer_idx on product_favorites (customer_id);

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------

create table carts (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references customers (id) on delete cascade,

  products_total  integer not null default 0,
  amount_to_pay   numeric(12,2) not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint carts_customer_id_key unique (customer_id)
);

create trigger carts_set_updated_at
  before update on carts
  for each row execute function set_updated_at();

create table cart_items (
  id         uuid primary key default gen_random_uuid(),
  cart_id    uuid not null references carts (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  quantity   integer not null check (quantity > 0),
  added_at   timestamptz not null default now(),

  constraint cart_items_unique_product unique (cart_id, product_id)
);

create index cart_items_cart_id_idx on cart_items (cart_id);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

-- A table rather than an enum: statuses carry display metadata and change with
-- business needs, without a DDL migration. Seeded in 0002.
create table order_statuses (
  code        text primary key,
  label       text not null,
  sort_order  smallint not null unique,
  is_terminal boolean not null default false
);

create table orders (
  id              uuid primary key default gen_random_uuid(),

  -- MP sends a numeric id, Nave a string order_id: text covers both
  payment_id      text not null,
  customer_id     uuid not null references customers (id),

  amount_paid     numeric(12,2) not null check (amount_paid >= 0),
  status          text not null default 'en_preparacion'
                    references order_statuses (code),
  ip_address      inet,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint orders_payment_id_key unique (payment_id)
);

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index orders_customer_id_idx on orders (customer_id, created_at desc);
create index orders_status_idx      on orders (status, created_at desc);

create table order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,

  -- nullable on purpose: a product may be delisted after the sale
  product_id uuid references products (id) on delete set null,

  -- snapshot at purchase time, must never follow the product
  name       text not null,
  quantity   integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

create index order_items_order_id_idx on order_items (order_id);

-- ---------------------------------------------------------------------------
-- Payment orders (gateway payloads)
-- ---------------------------------------------------------------------------

create table payment_orders (
  id                  uuid primary key default gen_random_uuid(),

  gateway             payment_gateway not null,
  gateway_payment_id  text,   -- MercadoPago `id`
  gateway_order_id    text,   -- Nave `order_id`

  customer_id         uuid references customers (id),

  status              text not null,
  status_detail       text,
  amount              numeric(12,2),

  payer               jsonb,
  items               jsonb,
  payment_method      jsonb,
  transaction_details jsonb,

  -- full untouched gateway response; the columns above are extracted from it
  raw                 jsonb not null default '{}'::jsonb,

  date_approved       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payment_orders_has_identifier
    check (gateway_payment_id is not null or gateway_order_id is not null)
);

create trigger payment_orders_set_updated_at
  before update on payment_orders
  for each row execute function set_updated_at();

create unique index payment_orders_gateway_payment_id_key
  on payment_orders (gateway, gateway_payment_id)
  where gateway_payment_id is not null;

create unique index payment_orders_gateway_order_id_key
  on payment_orders (gateway, gateway_order_id)
  where gateway_order_id is not null;

create index payment_orders_customer_idx on payment_orders (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Email verification / password reset hashes
-- ---------------------------------------------------------------------------

create table verification_hashes (
  -- created with crypto.randomUUID()
  hash        uuid primary key,
  customer_id uuid not null references customers (id) on delete cascade,
  reason      verification_reason not null,

  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);

create index verification_hashes_customer_idx on verification_hashes (customer_id);
create index verification_hashes_expires_idx  on verification_hashes (expires_at);

-- ---------------------------------------------------------------------------
-- Reference / content tables
-- ---------------------------------------------------------------------------

create table provinces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default true
);

create table carrusel_images (
  id         uuid primary key default gen_random_uuid(),
  image_url  text not null,
  link_url   text,
  position   integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index carrusel_images_position_idx
  on carrusel_images (position) where is_active;
