const productRepository = require("../../repositories/product.repository");

const searchEngine = async (req, res) => {
  try {
    const { keyword, limit } = req.body;

    const searchResult = await productRepository.search(keyword, limit);

    return res.status(200).json({ success: true, data: searchResult });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message, data: [] });
  }
};

module.exports = searchEngine;
