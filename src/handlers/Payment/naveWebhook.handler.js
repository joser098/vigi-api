const paymentRepository = require("../../repositories/payment.repository");
const orderRepository = require("../../repositories/order.repository");
const cartRepository = require("../../repositories/cart.repository");
const customerRepository = require("../../repositories/customer.repository");
const createOrderHandler = require("../Order/createOrder.handler");
const { successPayHtml } = require("../../utils/templates/emails");
const sendEmail = require("../../controllers/Notifications/sendEmail");
const senders = require("../../utils/senders");

const naveWebhook = async (req, res) => {
  try {
    const paymentDetails = req.body;

    if (paymentDetails.status !== "APPROVED") {
      return res.status(200).send();
    }

    //Get the payment order to update
    const paymentOrder = await paymentRepository.findByGatewayOrderId(
      paymentDetails.order_id
    );

    if (!paymentOrder) {
      return res.status(200).send();
    }

    await paymentRepository.approveNave({
      order_id: paymentDetails.order_id,
      status: paymentDetails.status,
      date_approved: paymentDetails.happened_at,
      amount: paymentDetails.amount.value,
      payment_method: paymentDetails.payment_method,
      raw: paymentDetails,
    });

    //Nave fires the webhook on every retry, so the order is only announced the
    //first time it is created.
    const order_exists = await orderRepository.findByPaymentId(
      paymentOrder.gateway_payment_id
    );

    //Create order
    await createOrderHandler(
      paymentOrder.gateway_payment_id,
      {
        items: paymentOrder.items,
        payer: { last_name: paymentOrder.customer_id },
        ip_address: null,
      },
      paymentDetails.amount.value
    );

    if (!order_exists) {
      const successPay = successPayHtml(
        paymentOrder.payer.name,
        paymentOrder.items,
        paymentDetails.amount.value,
        paymentDetails.happened_at,
        paymentDetails.payment_method.type,
        paymentOrder.gateway_payment_id
      );

      await sendEmail(
        paymentOrder.payer.email,
        senders.noreply,
        "Pago Exitoso | VIGI",
        successPay
      );
      await sendEmail(
        process.env.ADMIN_EMAIL,
        senders.noreply,
        "Nueva venta!",
        successPay
      );
    }

    //Empty Cart
    const customer = await customerRepository.findById(paymentOrder.customer_id);
    if (customer?.cart_id) {
      await cartRepository.empty(customer.cart_id);
    }

    return res.status(200).send();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = naveWebhook;
