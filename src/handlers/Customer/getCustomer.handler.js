const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _getCustomerByName = require("../../controllers/Customer/getCustomerByName.controller");

const getCustomer = async (req, res) => {
  try {
    const { id, name } = req.query;
    let customer;
    if (id) {
      customer = await _getCustomerById(id);
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
