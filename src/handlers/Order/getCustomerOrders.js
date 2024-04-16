const _getCustomerOrders = require("../../controllers/Order/getCustomerOrders.controller");

const getCustomerOrders = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const orders = await _getCustomerOrders(customer_id);

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getCustomerOrders;
