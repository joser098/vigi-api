const { query, withTransaction } = require("../db/client");
const { updated } = require("../db/result");

const CAMPOS = `
  id, code, description, kind, value, max_discount, min_purchase,
  max_redemptions, max_per_customer, redemptions,
  starts_at, ends_at, is_active
`;

// `code` es citext, así que la comparación ya es insensible a mayúsculas. Lo
// que sí hace falta es limpiar los espacios: el cliente pega el código con
// espacios al final más seguido de lo que uno querría.
const findByCode = async (code) => {
  const { rows } = await query(
    `select ${CAMPOS} from coupons where code = btrim($1)`,
    [String(code ?? "")]
  );

  return rows[0] ?? null;
};

const findById = async (id) => {
  const { rows } = await query(`select ${CAMPOS} from coupons where id = $1`, [
    id,
  ]);

  return rows[0] ?? null;
};

const countRedemptionsByCustomer = async (coupon_id, customer_id) => {
  const { rows } = await query(
    `select count(*)::int as total
       from coupon_redemptions
      where coupon_id = $1 and customer_id = $2`,
    [coupon_id, customer_id]
  );

  return rows[0]?.total ?? 0;
};

/**
 * El cupón se guarda en el carrito, no en el navegador. `coupon_id = null`
 * lo saca.
 */
const setOnCart = async (cart_id, coupon_id) => {
  const result = await query(
    `update carts set coupon_id = $2, coupon_discount = 0 where id = $1
     returning id`,
    [cart_id, coupon_id]
  );

  return updated(result);
};

/**
 * El cupón que quedó pendiente de registrar en el carrito de un cliente.
 *
 * Lo consume la creación de la orden, que corre desde el webhook y solo conoce
 * al cliente. Pide `coupon_discount > 0` para no registrar un canje de un cupón
 * que se aplicó y después se quitó, o de uno que caducó antes de pagar y por
 * eso se cobró sin descuento.
 */
const findPendingByCustomer = async (customer_id) => {
  const { rows } = await query(
    `select c.coupon_id, c.coupon_discount as discount, cp.code
       from carts c
       join coupons cp on cp.id = c.coupon_id
      where c.customer_id = $1
        and c.coupon_discount > 0`,
    [customer_id]
  );

  return rows[0] ?? null;
};

/**
 * Congela en el carrito cuánto descuento se aplicó al arrancar el pago.
 *
 * El webhook llega minutos después y solo trae lo que le mandamos a la
 * pasarela, que son ítems ya descontados: el monto del cupón no vuelve por ahí.
 * Esta columna es lo que permite que la orden lo registre.
 */
const setCartDiscount = async (cart_id, amount) => {
  const result = await query(
    `update carts set coupon_discount = $2 where id = $1 returning id`,
    [cart_id, amount]
  );

  return updated(result);
};

/**
 * Registra el canje. Corre cuando el pago se aprobó, no cuando el cliente
 * escribe el código.
 *
 * El `for update` sobre el cupón serializa los checkouts que compiten por las
 * últimas unidades de un cupón limitado: sin él, dos pagos simultáneos leen el
 * mismo contador y los dos pasan. `on conflict do nothing` cubre el otro caso,
 * que es el webhook que la pasarela reintenta.
 *
 * Devuelve true solo si el canje se escribió en esta llamada.
 */
const redeem = async ({ coupon_id, customer_id, order_id, amount }) =>
  withTransaction(async (client) => {
    const { rows } = await client.query(
      `select id, redemptions, max_redemptions
         from coupons where id = $1 for update`,
      [coupon_id]
    );

    const coupon = rows[0];
    if (!coupon) return false;

    if (
      coupon.max_redemptions != null &&
      coupon.redemptions >= coupon.max_redemptions
    ) {
      return false;
    }

    const result = await client.query(
      `insert into coupon_redemptions (coupon_id, customer_id, order_id, amount)
       values ($1, $2, $3, $4)
       on conflict (coupon_id, order_id) do nothing
       returning id`,
      [coupon_id, customer_id, order_id, amount]
    );

    return result.rowCount > 0;
  });

module.exports = {
  findByCode,
  findById,
  countRedemptionsByCustomer,
  setOnCart,
  setCartDiscount,
  findPendingByCustomer,
  redeem,
};
