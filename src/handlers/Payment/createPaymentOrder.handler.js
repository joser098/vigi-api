const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _createPaymentOrder = require("../../controllers/Payment/createPaymentOrder.controller");

const createPaymentOrder = async (req, res) => {
  try {
    const { customer_id, items, shipments } = req.body;

    const payer = await _getCustomerById(customer_id);

    const paymentOrder = await _createPaymentOrder(payer, items, shipments);

    return res.status(200).json({ success: true, data: paymentOrder });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = createPaymentOrder;
