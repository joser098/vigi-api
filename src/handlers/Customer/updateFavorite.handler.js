const _updateFavorite = require("../../controllers/Customer/updateFavorite.controller");

const updateFavorite = async (req, res) => {
  try {
    const { product_id, customer_id, action } = req.body;

    const result = await _updateFavorite(product_id, customer_id, action);

    if (result.acknowledged) {
      return res
        .status(200)
        .json({ success: true, message: "update favorite" });
    }

    return res.status(500).json({
      success: false,
      message: "update favorite failed",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = updateFavorite;
