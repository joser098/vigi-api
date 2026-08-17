const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const customerRepository = require("../../repositories/customer.repository");
const { validateLogin } = require("../../services/zod_schemas/login_validation");

const login = async (req, res) => {
  try {
    const validation = validateLogin(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ success: false, message: validation.error.issues[0].message });
    }

    const { email, password } = validation.data;
    const customer = await customerRepository.findCredentialsByEmail(email);

    if (!customer) {
      throw new Error(`No existe usuario con email: ${email}`);
    }

    if (!customer.is_active) {
      throw new Error("Correo electrónico no verificado");
    }

    const passwordMatches = await bcrypt.compare(password, customer.password);

    if (!passwordMatches) {
      throw new Error("Correo o contraseña incorrectos");
    }

    // Only what userAuth needs. The whole customer document used to be signed
    // here, which put the bcrypt hash inside a token the client can decode.
    const token = jwt.sign(
      { id: customer.id, cart_id: customer.cart_id, email: customer.email },
      process.env.JWT_SECRET
    );

    await customerRepository.updateLastLogin(customer.id);

    //TODO: Send login email to user
    return res
      .status(200)
      .json({ success: true, data: { access: true, token } });
  } catch (error) {
    let status;
    switch (error.message) {
      case "Correo electrónico no verificado":
        status = 401;
        break;
      case "Correo o contraseña incorrectos":
        status = 404;
        break;
      default:
        status = 500;
        break;
    }

    return res.status(status).json({ success: false, message: error.message });
  }
};
module.exports = login;
