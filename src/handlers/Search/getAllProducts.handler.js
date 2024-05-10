const _getAllProducts = require("../../controllers/Search/getAllproducts.controller");
const { formatPrice } = require("../../services/scripts");

const getAllProducts = async (req, res) => {
  try {
    const products = await _getAllProducts();
    
    products.map((product) => {
      if(product.has_promotion && product.discount > 0 && product.discount < 51){
        const price_formated = formatPrice(product.price, product.discount);

        product.price = price_formated.price_discount;
        product.price_diferred = price_formated.price_diferred;
        product.price_original = price_formated.price_original;
      }
    });

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getAllProducts;
