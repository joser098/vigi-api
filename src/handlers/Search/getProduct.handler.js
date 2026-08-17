const productRepository = require("../../repositories/product.repository");
const { productDic } = require("../../utils/dictionary");

const getProduct = async (req, res) => {
  try {
    const { id, model } = req.query;
    if (!id && !model)
      return res
        .status(400)
        .json({ success: false, message: "Missing query" });

    const product = id
      ? await productRepository.findById(id)
      : await productRepository.findByModel(model);

    return res.status(200).json({
      success: true,
      data: product ?? productDic.notFound,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getProduct;
