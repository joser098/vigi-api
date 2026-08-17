const customerRepository = require("../../repositories/customer.repository");

const updateFavorite = async (req, res) => {
  try {
    const { product_id, customer_id, action } = req.body;

    if (action !== "add" && action !== "remove") {
      return res
        .status(400)
        .json({ success: false, message: "action must be add or remove" });
    }

    if (action === "add") {
      await customerRepository.addFavorite(product_id, customer_id);
    } else {
      await customerRepository.removeFavorite(product_id, customer_id);
    }

    return res.status(200).json({ success: true, message: "update favorite" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = updateFavorite;
