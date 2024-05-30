const _getSimilarProducts = require("../../controllers/Search/getSimilarProducts.controller");
const { setPromotionsToProduct } = require("../../services/scripts");

const getSimilarProducts = async (req, res) => {
  try {
    const { category, provider } = req.query;

    const products = await _getSimilarProducts(category, provider);

    products.map((product) => {
      setPromotionsToProduct(product)
    });

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getSimilarProducts;
