const cartRepository = require("../../repositories/cart.repository");
const validateCartAdd = require("../../services/zod_schemas/cart_addProduct.schema");

const addProduct = async (req, res) => {
  try {
    const validateBody = validateCartAdd(req.body);

    if (!validateBody.success) {
      return res
        .status(400)
        .json({ message: validateBody.error.issues[0].message });
    }

    // Check if Cart exists
    const cartExists = await cartRepository.findById(validateBody.data.cart_id);

    if (!cartExists) {
      return res
        .status(400)
        .json({ success: false, message: "Cart does not exist" });
    }

    // Add product to cart
    let product = null;
    product = await cartRepository.setItems(validateBody.data);

    return res.status(200).json({
      success: true,
      data: product,
      message: "Products added successfully",
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = addProduct;
