const _assignCartToCustomer = require("../../controllers/Customer/assingCartToCustomer.controller");
const _createNewCart = require("../../controllers/Cart/createNewCart.controller");
const _registerCustomer = require("../../controllers/Customer/registerCustomer.controller");
const _validateCustomerExists = require("../../controllers/Customer/validateCustomerExists.controller");
const {
  validateCustomer,
} = require("../../services/zod_schemas/customer_validation.schema");
const _sendRegisterNotification = require("../../controllers/Notifications/sendNotification");

const registerCustomer = async (req, res) => {
  try {
    //Validate data types
    const validation = validateCustomer(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ success: false, message: validation.error.issues[0].message });
    }

    //Validate if the customer already exists
    const user = await _validateCustomerExists(validation.data);

    if (user.userFound) {
      return res.status(409).json({ success: false, message: user.message });
    }

    //Register the customer
    const customer = await _registerCustomer(validation.data);

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

    //Send notification
    await _sendRegisterNotification(validation.data.email, "Bienvenido a vigi.cam! 🎉", "register.html");

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
