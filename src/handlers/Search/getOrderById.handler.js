const orderRepository = require("../../repositories/order.repository");
const { orderDic } = require("../../utils/dictionary");

const getOrderById = async (req, res) => {
  try {
    const { id } = req.query;
    const order = await orderRepository.findById(id);

    return res
      .status(200)
      .json({ success: true, data: order ?? orderDic.notFound });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getOrderById;
