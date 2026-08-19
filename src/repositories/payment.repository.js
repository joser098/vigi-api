const { query } = require("../db/client");
const { isUuid } = require("../db/uuid");
const { customerIdDe } = require("../utils/mpPayment");

const PAYMENT_FIELDS = `
  id, gateway, gateway_payment_id, gateway_order_id, customer_id,
  status, status_detail, amount, payer, items, payment_method,
  transaction_details, raw, date_approved, created_at,
  -- La tarjeta no tiene columna propia: vive adentro de raw. Se expone acá
  -- porque el frontend la venía pidiendo como payment.card (su tipo la
  -- declaraba) y le llegaba undefined: la pantalla de "gracias por tu compra"
  -- reventaba en el server y el cliente veía una página en blanco después de
  -- haber pagado.
  raw -> 'card' as card
`;

const findByGatewayPaymentId = async (gateway_payment_id) => {
  const { rows } = await query(
    `select ${PAYMENT_FIELDS} from payment_orders
      where gateway_payment_id = $1`,
    [String(gateway_payment_id)]
  );

  return rows[0] ?? null;
};

const findByGatewayOrderId = async (gateway_order_id) => {
  const { rows } = await query(
    `select ${PAYMENT_FIELDS} from payment_orders
      where gateway_order_id = $1`,
    [gateway_order_id]
  );

  return rows[0] ?? null;
};

// The whole gateway response goes into `raw`; the columns above it are the
// fields worth querying. Repeated webhooks update in place instead of stacking
// rows, which is what the Mongo upsert did.
const saveMercadoPago = async (payment) => {
  // El customer_id sale de metadata, con fallback al viejo payer.last_name.
  // Ver utils/mpPayment.
  const customer_id = customerIdDe(payment);

  const { rows } = await query(
    `insert into payment_orders (
       gateway, gateway_payment_id, customer_id, status, status_detail, amount,
       payer, items, payment_method, transaction_details, raw, date_approved
     )
     values ('mercadopago', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (gateway, gateway_payment_id)
       where gateway_payment_id is not null
     do update set
       status              = excluded.status,
       status_detail       = excluded.status_detail,
       amount              = excluded.amount,
       payer               = excluded.payer,
       items               = excluded.items,
       payment_method      = excluded.payment_method,
       transaction_details = excluded.transaction_details,
       raw                 = excluded.raw,
       date_approved       = excluded.date_approved
     returning id`,
    [
      String(payment.id),
      customer_id,
      payment.status,
      payment.status_detail,
      payment.transaction_details?.total_paid_amount ??
        payment.transaction_amount ??
        null,
      JSON.stringify(payment.payer ?? null),
      JSON.stringify(payment.additional_info?.items ?? []),
      JSON.stringify(payment.payment_method ?? null),
      JSON.stringify(payment.transaction_details ?? null),
      JSON.stringify(payment),
      payment.date_approved ?? null,
    ]
  );

  return rows[0] ?? null;
};

// Nave creates the payment order before the customer pays, so the row starts
// out with no amount and no approval date.
const createNave = async ({
  payment_request_id,
  order_id,
  customer_id,
  status,
  payer,
  items,
  raw,
}) => {
  const { rows } = await query(
    `insert into payment_orders (
       gateway, gateway_payment_id, gateway_order_id, customer_id,
       status, payer, items, raw
     )
     values ('nave', $1, $2, $3, $4, $5, $6, $7)
     on conflict (gateway, gateway_order_id)
       where gateway_order_id is not null
     do update set
       gateway_payment_id = excluded.gateway_payment_id,
       status             = excluded.status,
       payer              = excluded.payer,
       items              = excluded.items,
       raw                = excluded.raw
     returning id`,
    [
      payment_request_id ? String(payment_request_id) : null,
      order_id,
      isUuid(customer_id) ? customer_id : null,
      status,
      JSON.stringify(payer ?? null),
      JSON.stringify(items ?? []),
      JSON.stringify(raw ?? {}),
    ]
  );

  return rows[0] ?? null;
};

const approveNave = async ({
  order_id,
  status,
  date_approved,
  amount,
  payment_method,
  raw,
}) => {
  const { rows } = await query(
    `update payment_orders
        set status              = $2,
            date_approved       = $3,
            amount              = $4,
            payment_method      = $5,
            transaction_details = $6,
            raw                 = $7
      where gateway = 'nave' and gateway_order_id = $1
    returning id`,
    [
      order_id,
      status,
      date_approved ?? null,
      amount ?? null,
      JSON.stringify(payment_method ?? null),
      JSON.stringify({ payment_method, total_paid_amount: amount }),
      JSON.stringify(raw ?? {}),
    ]
  );

  return rows[0] ?? null;
};

module.exports = {
  findByGatewayPaymentId,
  findByGatewayOrderId,
  saveMercadoPago,
  createNave,
  approveNave,
};
