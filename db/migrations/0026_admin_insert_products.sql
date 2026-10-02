-- El importador del panel ahora ofrece dar de alta los modelos de la lista del
-- proveedor que todavía no están en el catálogo.
--
-- Hasta acá el panel solo podía leer y actualizar productos (0006): no había
-- policy de INSERT ni GRANT, así que el alta falla con 42501.
--
-- Mismo criterio que con UPDATE: solo admins (is_admin()) y solo las columnas
-- que el alta necesita. `price` queda afuera: lo calcula el trigger
-- products_set_price (0005), que también corre en INSERT. `id`, `created_at` y
-- `updated_at` toman su default.
--
-- `model` sí entra, porque sin él no hay producto. Lo que sigue prohibido es
-- cambiarlo después (ver 0008): una vez creado, es la clave de las imágenes.

create policy admin_crea_productos on products for insert to authenticated
  with check (is_admin());

grant insert (
  model, title, description, provider, category, cost, margin_pct,
  is_active, location, power_type, is_analogue, tags, details
) on products to authenticated;
