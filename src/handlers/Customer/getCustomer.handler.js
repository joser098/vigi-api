const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _getCustomerByName = require("../../controllers/Customer/getCustomerByName.controller");

const getCustomer = async (req, res) => {
  try {
    const { customer_id, name } = req.body;

    let customer;
    if (customer_id) {
      customer = await _getCustomerById(customer_id);
    }

    if (name) {
      customer = await _getCustomerByName(name);
    }

    return res.status(200).json({ succsess: true, data: customer });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
module.exports = getCustomer;
