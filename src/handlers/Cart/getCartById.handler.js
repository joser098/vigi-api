const _getCartById = require("../../controllers/Cart/getCartById.controller");

const getCartById = async (req, res) => {
  try {
    const { id } = req.params;

    const cart = await _getCartById(id);
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    return res.status(200).json({ success: true, data: cart });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = getCartById;