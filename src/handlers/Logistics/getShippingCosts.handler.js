const customerRepository = require("../../repositories/customer.repository");
const {
  calculateShippingCost,
  formatAddress,
} = require("../../services/shipping");

const getShippingCosts = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const customer = await customerRepository.findById(customer_id);
    const { address } = customer.user_data;

    const shippingCost = await calculateShippingCost(address);

    return res.status(200).json({
      success: true,
      data: { address: formatAddress(address), shippingCost },
    });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
};

module.exports = getShippingCosts;
