const _getProductById = require("../../controllers/Search/getProductById.controller");
const _getProductByModel = require("../../controllers/Search/getProductByModel.controller");
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

    return res.status(200).json({
      success: true,
      data: product == null ? productDic.notFound : product,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProduct;
