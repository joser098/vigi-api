const _getAllProducts = require("../../controllers/Search/getAllproducts.controller");
const { setPromotionsToProduct } = require("../../services/scripts");

const getAllProducts = async (req, res) => {
  try {
    const products = await _getAllProducts();
    
    products.map((product) => {
      setPromotionsToProduct(product);
    });

    return res.status(200).json({ success: true, data: products });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = getAllProducts;
