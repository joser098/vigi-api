const _getAllOrders = require("../../controllers/Search/getAllOrders.controller");
const _getOrderByStatus = require("../../controllers/Search/getOrderByStatus.controller");
const validateOrderStatus = require("../../services/zod_schemas/orderStatus.schema");

const getOrders = async (req, res) => {
  try {
    const { status } = req.query;
    let orders = [];

    if (status) {
      //Check if status is a valid status
      const validation = validateOrderStatus(status);

      if (!validation.success) {
        return res
          .status(400)
          .json({
            success: false,
            message: validation.error.issues[0].message,
          });
      }

      orders = await _getOrderByStatus(validation.data);
    } else {
      orders = await _getAllOrders();
    }

    return res
      .status(200)
      .json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrders;
