const { query, withTransaction } = require("../db/client");
const { created, updated } = require("../db/result");

// Items keep the field names the cart has always returned, but title, image and
// price are read from products on every request instead of being frozen when
// the product was added.
const findById = async (cart_id) => {
  const { rows } = await query(
    `select
       c.id,
       c.customer_id,
       c.products_total,
       c.amount_to_pay,
       coalesce(
         json_agg(
           json_build_object(
             'id',          p.id,
             'title',       p.title,
             'picture_url', p.thumbnail,
             'quantity',    ci.quantity,
             'unit_price',  p.price
           )
           order by ci.added_at
         ) filter (where ci.id is not null),
         '[]'
       ) as items
     from carts c
     left join cart_items ci on ci.cart_id = c.id
     left join products   p  on p.id = ci.product_id
     where c.id = $1
     group by c.id`,
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
                  coalesce(sum(ci.quantity * p.price), 0) as amount
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

const empty = async (cart_id) =>
  withTransaction(async (client) => {
    await client.query(`delete from cart_items where cart_id = $1`, [cart_id]);

    const result = await client.query(
      `update carts
          set products_total = 0,
              amount_to_pay  = 0
        where id = $1
      returning id`,
      [cart_id]
    );

    return updated(result);
  });

module.exports = { findById, create, setItems, empty };
