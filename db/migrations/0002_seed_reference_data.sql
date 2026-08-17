-- VIGI API - Reference data seed
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Categories
--
-- Only real catalogue categories live here, because products.category has a
-- foreign key against this table.
--
-- "interior", "exterior", "bateria" and "analogas" are NOT categories: they are
-- browse facets, and they live in their own columns on products. See the facet
-- queries at the bottom of this file.
-- ---------------------------------------------------------------------------

insert into categories (name, label) values
  ('camaras',        'Cámaras'),
  ('alarmas',        'Alarmas'),
  ('almacenamiento', 'Almacenamiento'),
  ('kits',           'Kits'),
  ('porteros',       'Porteros')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Order statuses
--
-- orders.status has a foreign key against this table and defaults to
-- 'en_preparacion', so these rows must exist before the first order is created.
-- ---------------------------------------------------------------------------

insert into order_statuses (code, label, sort_order, is_terminal) values
  ('recibido',       'Recibido',       1, false),
  ('en_preparacion', 'En preparación', 2, false),
  ('enviado',        'Enviado',        3, false),
  ('entregado',      'Entregado',      4, true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Provinces (24 Argentine jurisdictions)
-- ---------------------------------------------------------------------------

insert into provinces (name) values
  ('Buenos Aires'),
  ('Ciudad Autónoma de Buenos Aires'),
  ('Catamarca'),
  ('Chaco'),
  ('Chubut'),
  ('Córdoba'),
  ('Corrientes'),
  ('Entre Ríos'),
  ('Formosa'),
  ('Jujuy'),
  ('La Pampa'),
  ('La Rioja'),
  ('Mendoza'),
  ('Misiones'),
  ('Neuquén'),
  ('Río Negro'),
  ('Salta'),
  ('San Juan'),
  ('San Luis'),
  ('Santa Cruz'),
  ('Santa Fe'),
  ('Santiago del Estero'),
  ('Tierra del Fuego'),
  ('Tucumán')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Facet reference
--
-- The four non-category browse filters, for whoever writes the query layer:
--
--   interior   ->  location = 'interior'
--   exterior   ->  location = 'exterior'
--   bateria    ->  power_type = 'bateria'
--   analogas   ->  is_analogue
--
-- All four are additionally constrained by is_active = true.
--
-- power_type must be normalised at load time (lowercase, unaccented), so the
-- query layer can compare for equality instead of matching a pattern.
-- ---------------------------------------------------------------------------
