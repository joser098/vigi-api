const _search = require("../../controllers/Search/search.controller");
const { setPromotionsToProduct } = require("../../services/scripts");

const searchEngine = async (req, res) => {
  try {
    const { keyword, limit } = req.body;

    let searchResult = await _search(keyword);

    if (limit) {
      searchResult = searchResult.slice(0, limit);
    }

    searchResult.map((product) => {
      setPromotionsToProduct(product);
    });

    return res.status(200).json({ success: true, data: searchResult });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message, data: [] });
  }
};

module.exports = searchEngine;
