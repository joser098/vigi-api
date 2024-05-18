const { MercadoPagoConfig, Payment } = require("mercadopago");
const _savePaymentOrder = require("../../controllers/Payment/savePaymentOrder.controller");
const sendNotification = require("../../controllers/Notifications/sendNotification");
const createOrderHandler = require("../Order/createOrder.handler");
const _sendEmail = require("../../controllers/Notifications/sendEmail");
const { successPayHtml } = require("../../utils/templates/emails");
const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");

const receiveWeebhook = async (req, res) => {
  try {
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const mp_payment = new Payment(client);
    const payment = req.query;

    let paymentDetails;
    if (payment.type === "payment") {
      paymentDetails = await mp_payment.get({
        id: payment["data.id"],
      });
      _savePaymentOrder(paymentDetails);
      
      createOrderHandler(paymentDetails.id ,paymentDetails.additional_info, paymentDetails.transaction_details.total_paid_amount);
    } else return res.status(204);

    const { user_data } = await _getCustomerById(paymentDetails.additional_info.payer.first_name);

    // Templates
    const successPay = successPayHtml(user_data.name,paymentDetails.additional_info.items, paymentDetails.transaction_amount, paymentDetails.date_approved, paymentDetails.payment_type_id);

    //Enviar correo al cliente y al admin
    if (paymentDetails.status === "approved") {
      _sendEmail(paymentDetails.payer.email, "Pago Exitoso | VIGI", successPay);
      _sendEmail(process.env.ADMIN_EMAIL, "Nueva venta!", successPay);
    }
    
    return res.status(204);
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: error.message });
  }
};
module.exports = receiveWeebhook;
