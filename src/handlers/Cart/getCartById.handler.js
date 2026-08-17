const cartRepository = require("../../repositories/cart.repository");

const getCartById = async (req, res) => {
  try {
    const { cart_id } = req.body;

    const cart = await cartRepository.findById(cart_id);
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    return res.status(200).json({ success: true, data: cart });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

module.exports = getCartById;