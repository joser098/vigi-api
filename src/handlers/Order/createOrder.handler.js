const orderRepository = require("../../repositories/order.repository");

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

    return await orderRepository.create({
      payment_id,
      customer_id: data.payer.last_name.toString(),
      amount_paid: Number(amount_paid),
      ip_address: data.ip_address,
      items,
    });
  } catch (error) {
    console.log(error);
    return error;
  }
};
module.exports = createOrderHandler;
