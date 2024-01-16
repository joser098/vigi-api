const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _updateCustomer = require("../../controllers/Customer/updateCustomer.controller");
const {
  validateUpdateCustomer,
} = require("../../services/zod_schemas/customer_validation.schema");

const updateCustomer = async (req, res) => {
  try {
    const validation = validateUpdateCustomer(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ message: validation.error.issues[0].message });
    }

    const { id } = req.params;
    const chekCustomer = await _getCustomerById(id);
    if (!chekCustomer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const customerUpdated = await _updateCustomer(id, validation.data);

    return res
      .status(200)
      .json({
        success: true,
        message: "Customer updated",
        data: customerUpdated,
      });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = updateCustomer;
