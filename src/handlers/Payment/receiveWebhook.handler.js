const { MercadoPagoConfig, Payment } = require("mercadopago");
const paymentRepository = require("../../repositories/payment.repository");
const orderRepository = require("../../repositories/order.repository");
const customerRepository = require("../../repositories/customer.repository");
const cartRepository = require("../../repositories/cart.repository");
const createOrderHandler = require("../Order/createOrder.handler");
const { successPayHtml } = require("../../utils/templates/emails");
const sendEmail = require("../../controllers/Notifications/sendEmail");
const senders = require("../../utils/senders");

const receiveWeebhook = async (req, res) => {
  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const mp_payment = new Payment(client);
    const payment = req.query;

    if (payment.type !== "payment") {
      return res.status(200).send();
    }

    const paymentDetails = await mp_payment.get({
      id: payment["data.id"],
    });

    //Save the payment order
    await paymentRepository.saveMercadoPago(paymentDetails);

    //Check if order already exists, not to repeat email notification.
    const order_exists = await orderRepository.findByPaymentId(
      paymentDetails.id
    );

    //Create order
    await createOrderHandler(
      paymentDetails.id,
      paymentDetails.additional_info,
      paymentDetails.transaction_details.total_paid_amount
    );

    //Find customer
    const customer = await customerRepository.findById(
      paymentDetails.additional_info.payer.last_name
    );

    //Send email notification to admin and customer about purchase
    if (!order_exists && paymentDetails.status === "approved") {
      const successPay = successPayHtml(
        customer.user_data.name,
        paymentDetails.additional_info.items,
        paymentDetails.transaction_amount,
        paymentDetails.date_approved,
        paymentDetails.payment_type_id,
        paymentDetails.id
      );

      await sendEmail(
        paymentDetails.payer.email,
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
    if (customer?.cart_id) {
      await cartRepository.empty(customer.cart_id);
    }

    return res.status(200).send();
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message });
  }
};
module.exports = receiveWeebhook;
