const _getProductsByCategory = require("../../controllers/Search/getProductsByCategory.controller");
const _getProuctsInPromotion = require("../../controllers/Search/getProductsInPromotion.controller");
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

    return res
      .status(200)
      .json({ success: true, data: products, total: products.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProducts;
