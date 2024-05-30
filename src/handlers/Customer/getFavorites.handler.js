const _getAllProducts = require("../../controllers/Search/getAllproducts.controller");
const { setPromotionsToProduct } = require("../../services/scripts");

const getFavorites = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const allProducts = await _getAllProducts();


    const favorites = allProducts.filter((product) =>
      product.favorites.includes(customer_id)
    );

    favorites.map((product) => {
      setPromotionsToProduct(product);
    });

    return res.status(200).json({ success: true, data: favorites });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = getFavorites;
