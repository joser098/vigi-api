const customerRepository = require("../../repositories/customer.repository");

const getFavorites = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const favorites = await customerRepository.findFavorites(customer_id);

    return res.status(200).json({ success: true, data: favorites });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = getFavorites;
