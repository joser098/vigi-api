const _createPaymentOrder = require("../../controllers/Payment/createPaymentOrder.controller");

const createPaymentOrder = async (req, res) => {
  try {
    const { customer_id, items } = req.body;
    const paymentOrder = await _createPaymentOrder(items);

    return res.status(200).json({ success: true, data: paymentOrder });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = createPaymentOrder;
