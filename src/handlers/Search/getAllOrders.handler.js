const _getAllOrders = require("../../controllers/Search/getAllOrders.controller");

const getAllOrders = async (req, res) => {
  try {
    const allOrders = await _getAllOrders();

    return res.status(200).json({ success: true, data: allOrders });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getAllOrders;
