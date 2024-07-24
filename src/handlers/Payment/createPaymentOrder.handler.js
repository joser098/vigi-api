const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _createPaymentOrderMePa = require("../../controllers/Payment/createPaymentOrder.controller");
const _createPaymentOrderNave = require("../../controllers/Payment/nave/createPaymentOrderNave.controller");
const _getBearerToken = require("../../controllers/Payment/nave/getBearerToken.controller");

const createPaymentOrder = async (req, res) => {
  try {
    const { customer_id, items, shipments, amount_to_pay, method } = req.body;

    const payer = await _getCustomerById(customer_id);

    let paymentOrder; 
    if(method == "nv"){
      //Get bearer_token
      const bearer_token = await _getBearerToken();

      paymentOrder = await _createPaymentOrderNave(bearer_token, payer, items, amount_to_pay)
      paymentOrder.init_point = paymentOrder.checkout_url;
    } else {
      paymentOrder = await _createPaymentOrderMePa(payer, items, shipments);
    }

    return res.status(200).json({ success: true, data: paymentOrder });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = createPaymentOrder;
