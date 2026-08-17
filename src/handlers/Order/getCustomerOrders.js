const orderRepository = require("../../repositories/order.repository");

const getCustomerOrders = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const orders = await orderRepository.findByCustomer(customer_id);

    return res.status(200).json({ success: true, data: orders });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getCustomerOrders;
