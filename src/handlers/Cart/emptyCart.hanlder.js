const _emptyCart = require("../../controllers/Cart/emptyCart.controller");
const _getCartById = require("../../controllers/Cart/getCartById.controller");
const validateId = require("../../services/zod_schemas/validateId.schema");

const emptyCart = async (req, res) => {
  try {
    const { id } = req.params;

    const validationId = validateId(id);
    if (!validationId.success) {
      return res.status(400).json({
        success: false,
        message: validationId.error.issues[0].message,
      });
    }

    //check if cart exists
    const cart = await _getCartById(id);
    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "Cart not found" });
    }

    const cartEmpty = await _emptyCart(id);

    return res.status(200).json({
      success: true,
      data: cartEmpty,
      message: "Cart emptied successfully",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = emptyCart;
