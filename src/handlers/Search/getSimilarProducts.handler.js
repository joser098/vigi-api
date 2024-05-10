const _getSimilarProducts = require("../../controllers/Search/getSimilarProducts.controller");
const { formatPrice } = require("../../services/scripts");

const getSimilarProducts = async (req, res) => {
  try {
    const { category, provider } = req.query;

    const products = await _getSimilarProducts(category, provider);

    products.map((product) => {
      if(product.has_promotion && product.discount > 0 && product.discount < 51){
        const price_formated = formatPrice(product.price, product.discount);

        product.price = price_formated.price_discount;
        product.price_diferred = price_formated.price_diferred;
        product.price_original = price_formated.price_original;
      }
    });

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getSimilarProducts;
