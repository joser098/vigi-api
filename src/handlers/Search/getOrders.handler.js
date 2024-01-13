const _getOrderByStatus = require("../../controllers/Search/getOrderByStatus.controller");

const getOrders = async (req, res) => {
  try {
    const { status } = req.query;

    let orders = [];

    if (status) {
      orders = await _getOrderByStatus(status);
    }

    return res
      .status(200)
      .json({ success: true, data: orders, total: orders.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrders;
