const { query, withTransaction } = require("../db/client");
const { created, updated } = require("../db/result");

// Items keep the field names the cart has always returned, but title, image and
// price are read from products on every request instead of being frozen when
// the product was added.
//
// `unit_price` es `effective_price`, o sea el precio CON el descuento, igual
// que en product.repository. Acá decía `p.price` —el precio de lista— así que
// una promoción no se veía en el carrito y, peor, tampoco se aplicaba al
// cobrar: `amount_to_pay` salía de la misma columna y de ahí lo tomaba el
// checkout. Un producto con 13% de descuento se cobraba entero.
//
// `price_original` viaja al lado para poder mostrar el precio tachado. Es null
// cuando no hay promoción, con el mismo criterio que usa el catálogo.
const findById = async (cart_id) => {
  const { rows } = await query(
    `select
       c.id,
       c.customer_id,
       c.products_total,
       -- El total se recalcula al leer en vez de confiar en la columna. La
       -- columna la escribe setItems, así que después de un cambio de precio
       -- queda vieja hasta que alguien toque el carrito: eso hacía que el
       -- subtotal en pantalla no coincidiera con lo que se cobraba.
       coalesce(sum(ci.quantity * p.effective_price), 0) as amount_to_pay,
       c.coupon_id,
       c.coupon_discount,
       c.local_pickup,
       c.delivery_type,
       c.shipping_agency,
       -- El cupón viaja entero y no como un monto ya calculado: su validez
       -- depende de la fecha, del subtotal y de cuántas veces lo usó el
       -- cliente, así que lo resuelve services/coupons en cada llamada.
       to_jsonb(cp) as coupon,
       coalesce(
         json_agg(
           json_build_object(
             'id',          p.id,
             'title',       p.title,
             'picture_url', p.thumbnail,
             'quantity',    ci.quantity,
             'unit_price',  p.effective_price,
             'price_original', case
               when p.has_promotion and p.discount between 1 and 50
               then p.price end
           )
           order by ci.added_at
         ) filter (where ci.id is not null),
         '[]'
       ) as items
     from carts c
     left join cart_items ci on ci.cart_id = c.id
     left join products   p  on p.id = ci.product_id
     left join coupons    cp on cp.id = c.coupon_id
     where c.id = $1
     group by c.id, cp.id`,
    [cart_id]
  );

  return rows[0] ?? null;
};

const create = async (customer_id) => {
  const result = await query(
    `insert into carts (customer_id) values ($1) returning id`,
    [customer_id]
  );

  return created(result);
};

// Replaces the cart contents wholesale, which is what the endpoint has always
// done: the client sends the full item list, not a delta.
const setItems = async ({ cart_id, items }) =>
  withTransaction(async (client) => {
    await client.query(`delete from cart_items where cart_id = $1`, [cart_id]);

    for (const item of items) {
      await client.query(
        `insert into cart_items (cart_id, product_id, quantity)
         values ($1, $2, $3)
         on conflict (cart_id, product_id)
           do update set quantity = excluded.quantity`,
        [cart_id, item.id, item.quantity]
      );
    }

    // Totals are derived from the stored items and current product prices. The
    // request's products_total and amount_to_pay are deliberately ignored.
    const result = await client.query(
      `update carts c
          set products_total = t.units,
              amount_to_pay  = t.amount
         from (
           select coalesce(sum(ci.quantity), 0)           as units,
                  coalesce(sum(ci.quantity * p.effective_price), 0) as amount
             from cart_items ci
             join products p on p.id = ci.product_id
            where ci.cart_id = $1
         ) t
        where c.id = $1
      returning c.id`,
      [cart_id]
    );

    return updated(result);
  });

// El retiro en oficina se guarda en el carrito y no viaja en el body del pago:
// es una opción que baja el total, y el checkout no le cree nada al request.
const setLocalPickup = async (cart_id, local_pickup) => {
  const result = await query(
    `update carts set local_pickup = $2 where id = $1 returning id`,
    [cart_id, Boolean(local_pickup)]
  );

  return updated(result);
};

// Forma de entrega de Correo Argentino (migración 0028). La sucursal se guarda
// como snapshot de lo que devolvió MiCorreo; el handler ya verificó que exista.
// Volver a domicilio la borra, para que el constraint no quede colgado.
const setDelivery = async (cart_id, delivery_type, agency = null) => {
  const result = await query(
    `update carts
        set delivery_type   = $2,
            shipping_agency = $3
      where id = $1
    returning id`,
    [cart_id, delivery_type, delivery_type === "S" ? JSON.stringify(agency) : null]
  );

  return updated(result);
};

// Congela el envío cobrado al arrancar el pago, como `coupon_discount`: el
// webhook no lo trae y la orden lo necesita. Un carrito que nunca eligió se
// cotizó como domicilio, y así queda anotado.
const setShippingCost = async (cart_id, amount) => {
  const result = await query(
    `update carts
        set shipping_cost = $2,
            delivery_type = coalesce(delivery_type, 'D')
      where id = $1
    returning id`,
    [cart_id, amount]
  );

  return updated(result);
};

/**
 * La forma de entrega con la que se pagó, para copiarla a la orden. Mismo
 * camino que el cupón (coupon.repository.findPendingByCustomer): el carrito
 * todavía no se vació cuando se crea la orden.
 */
const findPendingShippingByCustomer = async (customer_id) => {
  const { rows } = await query(
    `select delivery_type, shipping_agency, shipping_cost
       from carts
      where customer_id = $1
        and shipping_cost is not null`,
    [customer_id]
  );

  return rows[0] ?? null;
};

const empty = async (cart_id) =>
  withTransaction(async (client) => {
    await client.query(`delete from cart_items where cart_id = $1`, [cart_id]);

    // El cupón se va con el carrito: dejarlo puesto haría que la próxima
    // compra arrancara con un descuento que nadie volvió a pedir.
    const result = await client.query(
      `update carts
          set products_total  = 0,
              amount_to_pay   = 0,
              coupon_id       = null,
              coupon_discount = 0,
              local_pickup    = false,
              delivery_type   = null,
              shipping_agency = null,
              shipping_cost   = null
        where id = $1
      returning id`,
      [cart_id]
    );

    return updated(result);
  });

module.exports = {
  findById,
  create,
  setItems,
  setLocalPickup,
  setDelivery,
  setShippingCost,
  findPendingShippingByCustomer,
  empty,
};
