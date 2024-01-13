const _assignCartToCustomer = require("../../controllers/Customer/assingCartToCustomer.controller");
const _createNewCart = require("../../controllers/Cart/createNewCart.controller");
const _registerCustomer = require("../../controllers/Customer/registerCustomer.controller");

const registerCustomer = async (req, res) => {
  try {
    const { username, email, password, name, last_name, address, phone, DNI } =
      req.body;

    //TODO: Validate data types
    //TODO: Validate if the customer already exists

    //Register the customer
    const customer = await _registerCustomer(req.body);

    //Create a new cart for the customer
    let cart;
    if (customer.acknowledged) {
      cart = await _createNewCart(customer.insertedId);
    }

    // Assign the cart to the customer
    let asssingmentResult;
    if (cart.acknowledged) {
      asssingmentResult = await _assignCartToCustomer(
        customer.insertedId,
        cart.insertedId
      );
    }

    const res_model = {
      customer,
      cart,
      asssingmentResult,
    };

    if (asssingmentResult.acknowledged) {
      return res.status(201).json(res_model);
    }

    return res
      .status(500)
      .json({ success: false, message: "Register customer when wrong" });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = registerCustomer;
