const { MercadoPagoConfig, Payment } = require("mercadopago");
const paymentRepository = require("../repositories/payment.repository");
const orderRepository = require("../repositories/order.repository");
const customerRepository = require("../repositories/customer.repository");
const cartRepository = require("../repositories/cart.repository");
const createOrderHandler = require("../handlers/Order/createOrder.handler");
const { successPayHtml } = require("../utils/templates/emails");
const sendEmail = require("../controllers/Notifications/sendEmail");
const senders = require("../utils/senders");
const { customerIdDe } = require("../utils/mpPayment");

/**
 * Registrar un pago de Mercado Pago: una sola función, tres puertas.
 *
 * Antes esto vivía dentro del webhook, y el webhook era el ÚNICO camino por el
 * que una venta llegaba a la base. Si la notificación se perdía —URL vieja,
 * timeout, un deploy a destiempo— el cliente pagaba y no quedaba registro de
 * nada. Eso ya pasó.
 *
 * Ahora la misma función la llaman:
 *
 *   1. el webhook            (`POST /api/payment/webhook`)
 *   2. la vuelta del cliente (`GET /api/payment/feedback`, el redirect de MP)
 *   3. la conciliación       (`node db/reconcile-mercadopago.js`)
 *
 * Los tres hacen lo mismo y ninguno depende de los otros. Alcanza con que UNO
 * funcione. Es idempotente por construcción: el pago se upsertea por
 * `gateway_payment_id` y la orden tiene `on conflict (payment_id) do nothing`,
 * así que llamarla diez veces con el mismo id deja exactamente una orden y
 * manda exactamente un mail.
 */

const mpClient = () =>
  new Payment(
    new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
  );

/** Los ítems, del lugar donde estén. Sin esto no se puede armar la orden. */
const itemsDe = (payment) =>
  payment?.additional_info?.items ?? payment?.items ?? [];

/**
 * @returns {Promise<{ recorded: boolean, status: string, order_created: boolean, reason?: string }>}
 */
const recordMercadoPagoPayment = async (paymentId) => {
  if (!paymentId) {
    return { recorded: false, status: "unknown", order_created: false, reason: "sin id de pago" };
  }

  const payment = await mpClient().get({ id: String(paymentId) });

  // El pago queda guardado pase lo que pase —aprobado, rechazado o pendiente—.
  // Un rechazo también es información: sin la fila, un reclamo de "pagué y no
  // figura" no se puede ni mirar.
  await paymentRepository.saveMercadoPago(payment);

  if (payment.status !== "approved") {
    // La orden se crea solo con el pago aprobado. Antes se creaba con
    // cualquier estado, así que un rechazo entraba como venta.
    return {
      recorded: true,
      status: payment.status,
      order_created: false,
      reason: `el pago está en ${payment.status}`,
    };
  }

  const customer_id = customerIdDe(payment);

  // Sin cliente no hay orden que crear, y el error de clave foránea que saldría
  // más abajo no dice nada. Que reviente acá, con el id del pago a mano: el
  // pago ya quedó guardado, así que la venta es rastreable igual.
  if (!customer_id) {
    throw new Error(
      `El pago ${payment.id} no trae customer_id (ni en metadata ni en additional_info.payer.last_name)`
    );
  }

  const yaExistia = await orderRepository.findByPaymentId(payment.id);

  const monto =
    payment.transaction_details?.total_paid_amount ??
    payment.transaction_amount;

  const resultado = await createOrderHandler(
    payment.id,
    {
      items: itemsDe(payment),
      payer: { last_name: customer_id },
      ip_address: payment.additional_info?.ip_address ?? null,
    },
    monto
  );

  const creadaAhora = Boolean(resultado?.inserted) && !yaExistia;

  // Mail y vaciado del carrito solo la primera vez. El vaciado además solo con
  // el pago aprobado: antes se vaciaba con cualquier notificación, así que un
  // pago rechazado le borraba el carrito al cliente.
  if (creadaAhora) {
    const customer = await customerRepository.findById(customer_id);

    if (customer) {
      const html = successPayHtml(
        customer.user_data.name,
        itemsDe(payment),
        monto,
        payment.date_approved,
        payment.payment_type_id,
        payment.id
      );

      await sendEmail(customer.email, senders.noreply, "Pago Exitoso | VIGI", html);
      await sendEmail(process.env.ADMIN_EMAIL, senders.noreply, "Nueva venta!", html);

      if (customer.cart_id) await cartRepository.empty(customer.cart_id);
    }
  }

  return {
    recorded: true,
    status: payment.status,
    order_created: creadaAhora,
  };
};

module.exports = { recordMercadoPagoPayment };
