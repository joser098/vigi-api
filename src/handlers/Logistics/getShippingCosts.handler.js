const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _getShippingCostsByAddress = require("../../controllers/Logistics/getShippingCostsByAddress.controller");

const getShippingCosts = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const customer = await _getCustomerById(customer_id);

    const shippingCost = _getShippingCostsByAddress(customer.user_data.address);

    const {address} = customer.user_data;

    const address_str = `${address.address_name} ${address.address_number} ${address.department ? address.department : ""}, ${address.location}. ${address.province}. ${address.zip_code}`;

    res.status(200).json({ success: true, data: { address: address_str, shippingCost } });
  } catch (error) {
    return res.status(500).json({ error: error });
  }
};

module.exports = getShippingCosts;
