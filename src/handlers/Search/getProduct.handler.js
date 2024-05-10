const _getProductById = require("../../controllers/Search/getProductById.controller");
const _getProductByModel = require("../../controllers/Search/getProductByModel.controller");
const { formatPrice } = require("../../services/scripts");
const { productDic } = require("../../utils/dictionary");

const getProduct = async (req, res) => {
  try {
    const { id, model } = req.query;
    if(!id && !model) return res.status(400).json({ success: false, message: "Missing query" });

    let product = {};

    if (id) {
      product = await _getProductById(id);
    }

    if (model) {
      product = await _getProductByModel(model);
    }

    if(product.has_promotion && product.discount > 0 && product.discount < 51){
      const price_formated = formatPrice(product.price, product.discount);

      product.price = price_formated.price_discount;
      product.price_diferred = price_formated.price_diferred;
      product.price_original = price_formated.price_original;
    }

    return res.status(200).json({
      success: true,
      data: product == null ? productDic.notFound : product,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProduct;
