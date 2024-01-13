const _getOrderByStatus = require("../../controllers/Search/getOrderByStatus.controller");

const getOrderByStatus = async (req, res) => {
  try {
    const { status } = req.query;
    const order = await _getOrderByStatus(status);

    return res.status(200).json({ success: true, data: order });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrderByStatus;
