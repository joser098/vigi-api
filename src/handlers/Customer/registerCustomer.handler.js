const customerRepository = require("../../repositories/customer.repository");
const verificationRepository = require("../../repositories/verification.repository");
const cartRepository = require("../../repositories/cart.repository");
const {
  validateCustomer,
} = require("../../services/zod_schemas/customer_validation.schema");
const { emailVerificationHtml } = require("../../utils/templates/emails");
const sendEmail = require("../../controllers/Notifications/sendEmail");
const senders = require("../../utils/senders");
const { joinUrl } = require("../../utils/urls");

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
    const existing = await customerRepository.findByEmail(validation.data.email);

    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Ya existe un usuario con este correo ${validation.data.email}`,
      });
    }

    //Register the customer
    const customer = await customerRepository.create(validation.data);

    //Create a new cart for the customer. The cart references the customer, so
    //there is no separate assignment step any more.
    let cart;
    if (customer.inserted) {
      cart = await cartRepository.create(customer.id);
    }

    const res_model = {
      success: true,
      customer,
      cart,
    };

    //create hash with userId
    const verification_hash = await verificationRepository.create(
      customer.id,
      "register"
    );

    //Send email verification
    const template = emailVerificationHtml(
      validation.data.name,
      joinUrl(process.env.MP_BACK_URL, `/api/customer/verification/${verification_hash}`)
    );
    await sendEmail(
      validation.data.email,
      senders.verification,
      "VIGI | Verifica tu correo",
      template
    );

    if (cart?.inserted) {
      return res.status(201).json(res_model);
    }

    return res
      .status(500)
      .json({ success: false, message: "Register customer when wrong" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
module.exports = registerCustomer;
