const productRepository = require("../../repositories/product.repository");

const getSimilarProducts = async (req, res) => {
  try {
    const { category, provider } = req.query;

    const products = await productRepository.findSimilar(category, provider);

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getSimilarProducts;
