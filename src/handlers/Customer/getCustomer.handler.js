const customerRepository = require("../../repositories/customer.repository");

const getCustomer = async (req, res) => {
  try {
    const { customer_id, name } = req.body;

    let customer;
    if (customer_id) {
      customer = await customerRepository.findById(customer_id);
    }

    if (name) {
      customer = await customerRepository.findByName(name);
    }

    return res.status(200).json({ succsess: true, data: customer });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
module.exports = getCustomer;
