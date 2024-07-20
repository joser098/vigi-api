const { MercadoPagoConfig, Payment } = require("mercadopago");
const _savePaymentOrder = require("../../controllers/Payment/savePaymentOrder.controller");
const createOrderHandler = require("../Order/createOrder.handler");
const { successPayHtml } = require("../../utils/templates/emails");
const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _getOrderByPaymentId = require("../../controllers/Order/getOrderByPaymentId.controller");
const _emptyCart = require("../../controllers/Cart/emptyCart.controller");
const sendEmailSES = require("../../controllers/Notifications/sendEmailSES");

const receiveWeebhook = async (req, res) => {
  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const mp_payment = new Payment(client);
    const payment = req.query;

    if (payment.type !== "payment") {
      return res.status(204).send();
    }

    const paymentDetails = await mp_payment.get({
      id: payment["data.id"],
    });

    //Save the payment order
    await _savePaymentOrder(paymentDetails);

    //Check if order already exists, not to repeat email notification.
    const order_exists = await _getOrderByPaymentId(paymentDetails.id);

    //Create order
    await createOrderHandler(
      paymentDetails.id,
      paymentDetails.additional_info,
      paymentDetails.transaction_details.total_paid_amount
    );

    //Find customer
    const customer = await _getCustomerById(paymentDetails.additional_info.payer.last_name);

    // Email HTML Template
    const successPay = successPayHtml(
      customer.user_data.name,
      paymentDetails.additional_info.items,
      paymentDetails.transaction_amount,
      paymentDetails.date_approved,
      paymentDetails.payment_type_id,
      paymentDetails.id
    );

    //Send email notification to admin and customer about purchase
    if (!order_exists && paymentDetails.status === "approved") {
      await sendEmailSES(paymentDetails.payer.email, "noreply@vigi.cam", "Pago Exitoso | VIGI", successPay);
      await sendEmailSES(process.env.ADMIN_EMAIL, "noreply@vigi.cam", "Nueva venta!", successPay);
    }

    //Empty Cart
    _emptyCart(customer.cart_id)

    return res.status(204).send();
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message });
  }
};
module.exports = receiveWeebhook;
