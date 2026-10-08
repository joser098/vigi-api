-- Envío con Correo Argentino (API MiCorreo): domicilio o retiro en sucursal.
--
-- Reemplaza a Andreani. El cliente elige en el checkout entre envío a
-- domicilio ('D'), retiro en una sucursal de Correo ('S', más barato) o
-- acordar el envío ('A': no se cobra y se coordina después, para no perder la
-- venta). 'D' y 'S' son los códigos de MiCorreo (`deliveredType` en /rates).
--
-- Igual que el cupón (0011): la elección se guarda en el carrito y no viaja en
-- el body del pago, porque baja el total. Y como el webhook llega después y no
-- trae nada de esto, el checkout deja el costo anotado en el carrito y la orden
-- lo copia al crearse.

-- ---------------------------------------------------------------------------
-- Carrito
-- ---------------------------------------------------------------------------

alter table carts
  -- NULL = todavía no eligió: se cotiza como domicilio.
  add column delivery_type   text check (delivery_type in ('D', 'S', 'A')),

  -- Snapshot de la sucursal tal como la devolvió MiCorreo al elegirla
  -- (código, nombre, dirección, horarios). El código es lo que pide
  -- /shipping/import; el resto es para mostrarla sin volver a consultar.
  add column shipping_agency jsonb,

  -- Lo que se cobró de envío al arrancar el pago. Lo escribe
  -- createPaymentOrder y lo consume la orden, como `coupon_discount`.
  add column shipping_cost   numeric(12,2) check (shipping_cost >= 0),

  add constraint carts_sucursal_con_agencia
    check (delivery_type is distinct from 'S' or shipping_agency is not null);

-- ---------------------------------------------------------------------------
-- Orden
-- ---------------------------------------------------------------------------

alter table orders
  add column delivery_type   text check (delivery_type in ('D', 'S', 'A')),
  add column shipping_agency jsonb,
  add column shipping_cost   numeric(12,2) check (shipping_cost >= 0);

comment on column orders.delivery_type is
  'D = Correo a domicilio, S = Correo retiro en sucursal (ver shipping_agency), A = envío a acordar con el cliente (no se cobró). NULL en órdenes anteriores a la 0028.';
