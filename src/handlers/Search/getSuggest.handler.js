const productRepository = require("../../repositories/product.repository");

const getSuggest = async (req, res) => {
  try {
    const { keyword, limit } = req.body;

    // Ezviz first, then relevance, then price — all resolved in SQL.
    const suggestList = await productRepository.suggest(keyword, limit);

    return res.status(200).json({ success: true, data: suggestList });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, data: [], message: error.message });
  }
};

module.exports = getSuggest;
