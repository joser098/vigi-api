const sendEmailSES = require("../../controllers/Notifications/sendEmailSES");
const _getPayment = require("../../controllers/Payment/getPayment.controller");
const _savePaymentOrder = require("../../controllers/Payment/savePaymentOrder.controller");
const { successPayHtml } = require("../../utils/templates/emails");
const createOrderHandler = require("../Order/createOrder.handler");

const naveWebhook = async (req, res) => {
  try {
    const paymentDetails = req.body;

    if (paymentDetails.status !== "APPROVED") {
      return res.status(200).send();
    }

    //Get the payment order to update
    const paymentOrder = await _getPayment(null,paymentDetails.order_id);

    const paymentOrderUpdated = {
        ...paymentOrder,
        status: paymentDetails.status,
        date_approved: paymentDetails.happened_at,
        transaction_details: {
          payment_method: paymentDetails.payment_method,
          total_paid_amount: paymentDetails.amount.value
        }
    }

    await _savePaymentOrder(null,paymentOrderUpdated);

    //Create order
    const order_details = {
        items: paymentOrder.items,
        payer: {
            last_name: paymentOrder.payer.id,
        },
        ip_address: null,
    }

    await createOrderHandler(
        paymentOrder.id,
        order_details,
        paymentDetails.amount.value
      );

    // Email HTML Template
    const successPay = successPayHtml(
        paymentOrder.payer.name,
        paymentOrder.items,
        paymentDetails.amount.value,
        paymentDetails.happened_at,
        paymentDetails.payment_method.type,
        paymentOrder.id
      );
    
    //Send email notification to admin and customer about purchase  
    await sendEmailSES(paymentOrder.payer.email, "noreply@vigi.cam", "Pago Exitoso | VIGI", successPay);
    await sendEmailSES(process.env.ADMIN_EMAIL, "noreply@vigi.cam", "Nueva venta!", successPay);  

    return res.status(200).send();
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = naveWebhook;
