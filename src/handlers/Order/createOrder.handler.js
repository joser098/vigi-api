const orderRepository = require("../../repositories/order.repository");
const couponRepository = require("../../repositories/coupon.repository");

// Called from the payment webhooks, not from a route: it receives the gateway
// payload rather than req/res.
//
// status and date are no longer set here. The columns default to
// 'en_preparacion' and now(), and marking the customer happens inside the same
// transaction as the order.
const createOrderHandler = async (payment_id, data, amount_paid) => {
  try {
    const items = data.items.map((item) => ({
      id: item.id,
      name: item.title,
      quantity: item.quantity,
      unit_price: item.unit_price,
    }));

    const customer_id = data.payer.last_name.toString();

    // El cupón no vuelve por la pasarela: los ítems ya viajaron descontados.
    // Lo dejó anotado el checkout en el carrito, que todavía no se vació.
    const pending = await couponRepository.findPendingByCustomer(customer_id);

    const result = await orderRepository.create({
      payment_id,
      customer_id,
      amount_paid: Number(amount_paid),
      ip_address: data.ip_address,
      items,
      coupon_id: pending?.coupon_id ?? null,
      coupon_code: pending?.code ?? null,
      discount: pending?.discount ?? 0,
    });

    // Solo si la orden se insertó en esta llamada: la pasarela reintenta el
    // webhook, y un canje contado dos veces le gasta el cupón a otro cliente.
    if (pending && result.inserted && result.id) {
      await couponRepository.redeem({
        coupon_id: pending.coupon_id,
        customer_id,
        order_id: result.id,
        amount: pending.discount,
      });
    }

    return result;
  } catch (error) {
    console.log(error);
    return error;
  }
};
module.exports = createOrderHandler;
