const productRepository = require("../../repositories/product.repository");

const getAllProducts = async (req, res) => {
  try {
    const products = await productRepository.findAll();

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getAllProducts;
