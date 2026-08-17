const orderRepository = require("../../repositories/order.repository");
const {
  validateOrderStatus,
} = require("../../services/zod_schemas/enums.schema");

const getOrders = async (req, res) => {
  try {
    const { status } = req.query;

    if (status) {
      const validation = validateOrderStatus(status);

      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.error.issues[0].message,
        });
      }

      const orders = await orderRepository.findByStatus(validation.data);

      return res
        .status(200)
        .json({ success: true, data: orders, total: orders.length });
    }

    const orders = await orderRepository.findAll();

    return res
      .status(200)
      .json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrders;
