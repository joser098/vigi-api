const productRepository = require("../../repositories/product.repository");
const {
  validateCategoryProduct,
} = require("../../services/zod_schemas/enums.schema");

const getProducts = async (req, res) => {
  try {
    const { category, promotion, order } = req.query;
    if (!category && !promotion) {
      return res.status(400).json({ success: false, message: "Missing query" });
    }

    let products = [];

    if (category && category !== "promociones") {
      const validation = validateCategoryProduct(category);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: validation.error.issues[0].message,
        });
      }

      // validation.data is the canonical form: lowercase and unaccented.
      products = await productRepository.findByCategory(validation.data, order);
    }

    if (promotion || category == "promociones") {
      products = await productRepository.findInPromotion(order);
    }

    return res
      .status(200)
      .json({ success: true, data: products, total: products.length });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProducts;
