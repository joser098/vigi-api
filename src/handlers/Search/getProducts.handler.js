const _getProductsByCategory = require("../../controllers/Search/getProductsByCategory.controller");
const _getProuctsInPromotion = require("../../controllers/Search/getProductsInPromotion.controller");
const { formatPrice } = require("../../services/scripts");
const {
  validateCategoryProduct,
} = require("../../services/zod_schemas/enums.schema");

const getProducts = async (req, res) => {
  try {
    const { category, promotion } = req.query;
    if (!category && !promotion) {
      return res
        .status(400)
        .json({ success: false, message: "Missing query" });
    }

    let products = [];

    if (category) {
      const validation = validateCategoryProduct(category);
      if (!validation.success){
        return res
        .status(400)
        .json({
          success: false,
          message: validation.error.issues[0].message,
        });
      }

      products = await _getProductsByCategory(category);
    }

    if (promotion) {
      products = await _getProuctsInPromotion();
    }

    products.map((product) => {
      if(product.has_promotion && product.discount > 0 && product.discount < 51){
        const price_formated = formatPrice(product.price, product.discount);

        product.price = price_formated.price_discount;
        product.price_diferred = price_formated.price_diferred;
        product.price_original = price_formated.price_original;
      }
    });

    return res
      .status(200)
      .json({ success: true, data: products, total: products.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProducts;
