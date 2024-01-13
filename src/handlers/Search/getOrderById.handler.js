const _getOrderById = require("../../controllers/Search/getOrderById.controller");
const { orderDic } = require("../../utils/dictionary");

const getOrderById = async (req, res) => {
  try {
    const { id } = req.query;
    const order = await _getOrderById(id);

    return res
      .status(200)
      .json({ success: true, data: order != null ? order : orderDic.notFound });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrderById;
