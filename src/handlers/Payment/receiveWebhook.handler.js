const { MercadoPagoConfig, Payment } = require("mercadopago");
const _savePaymentOrder = require("../../controllers/Payment/savePaymentOrder.controller");
const sendNotification = require("../../controllers/Notifications/sendNotification");
const createOrderHandler = require("../Order/createOrder.handler");

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


    //Enviar correo al cliente y al admin
    if (paymentDetails.status === "approved") {
      sendNotification(
        paymentDetails.payer.email,
        "Pago Exitoso!🥳",
        "successPay.html"
      );
      sendNotification(
        process.env.ADMIN_EMAIL,
        "Nueva Venta!🤑",
        "successPay.html"
      );
    }
    
    return res.status(204);
  } catch (error) {
    console.log(error);
    return res.status(400).json({ message: error.message });
  }
};
module.exports = receiveWeebhook;
