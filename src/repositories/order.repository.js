const { query, withTransaction } = require("../db/client");
const { created } = require("../db/result");
const { isUuid } = require("../db/uuid");

// Items are snapshots taken at purchase time, so they are read from order_items
// and never re-joined against products: a later price change must not rewrite
// what was sold.
const ORDER_FIELDS = `
  o.id,
  o.payment_id,
  o.customer_id,
  o.amount_paid,
  o.discount,
  o.coupon_code,
  o.status,
  o.ip_address,
  o.created_at as date,
  s.label as status_label,
  coalesce(
    json_agg(
      json_build_object(
        'name',       oi.name,
        'quantity',   oi.quantity,
        'unit_price', oi.unit_price
      )
    ) filter (where oi.id is not null),
    '[]'
  ) as items
`;

const ORDER_FROM = `
  from orders o
  join order_statuses s on s.code = o.status
  left join order_items oi on oi.order_id = o.id
`;

const GROUP_BY = `group by o.id, s.label, s.sort_order`;

const findById = async (id) => {
  if (!isUuid(id)) throw new Error("El id de la orden no es válido");

  const { rows } = await query(
    `select ${ORDER_FIELDS} ${ORDER_FROM} where o.id = $1 ${GROUP_BY}`,
    [id]
  );

  return rows[0] ?? null;
};

const findAll = async () => {
  const { rows } = await query(
    `select ${ORDER_FIELDS} ${ORDER_FROM} ${GROUP_BY} order by o.created_at desc`
  );

  return rows;
};

const findByStatus = async (status) => {
  const { rows } = await query(
    `select ${ORDER_FIELDS} ${ORDER_FROM} where o.status = $1 ${GROUP_BY}
     order by o.created_at desc`,
    [status]
  );

  return rows;
};

const findByCustomer = async (customer_id) => {
  if (!isUuid(customer_id)) throw new Error("El id del cliente no es válido");

  const { rows } = await query(
    `select ${ORDER_FIELDS} ${ORDER_FROM} where o.customer_id = $1 ${GROUP_BY}
     order by o.created_at desc`,
    [customer_id]
  );

  return rows;
};

// Gateways send the same id as text or number depending on the provider.
const findByPaymentId = async (payment_id) => {
  const { rows } = await query(
    `select ${ORDER_FIELDS} ${ORDER_FROM} where o.payment_id = $1 ${GROUP_BY}`,
    [String(payment_id)]
  );

  return rows[0] ?? null;
};

// Order, items and the customer flag land together or not at all. Payment
// webhooks retry, so an existing payment_id is left untouched instead of being
// overwritten: the sale is already recorded.
//
// status and date are not passed: the column defaults own them.
// coupon_id, coupon_code y discount son un snapshot: quedan congelados aunque
// después se edite o se borre el cupón, igual que los precios de order_items.
const create = async ({
  payment_id,
  customer_id,
  amount_paid,
  ip_address,
  items,
  coupon_id = null,
  coupon_code = null,
  discount = 0,
}) =>
  withTransaction(async (client) => {
    const order = await client.query(
      `insert into orders
         (payment_id, customer_id, amount_paid, ip_address,
          coupon_id, coupon_code, discount)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (payment_id) do nothing
       returning id`,
      [
        String(payment_id),
        customer_id,
        amount_paid,
        ip_address || null,
        coupon_id,
        coupon_code,
        discount,
      ]
    );

    if (order.rowCount === 0) return created(order);

    const order_id = order.rows[0].id;

    for (const item of items) {
      await client.query(
        `insert into order_items (order_id, product_id, name, quantity, unit_price)
         values ($1, $2, $3, $4, $5)`,
        [
          order_id,
          isUuid(item.id) ? item.id : null,
          item.name,
          item.quantity,
          item.unit_price,
        ]
      );
    }

    await client.query(
      `update customers set has_order_active = true where id = $1`,
      [customer_id]
    );

    return created(order);
  });

module.exports = {
  findById,
  findAll,
  findByStatus,
  findByCustomer,
  findByPaymentId,
  create,
};
