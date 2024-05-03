const _createEmailVerificationHash = require("../../controllers/Customer/createEmailVerificationHash.controller");
const _validateCustomerExists = require("../../controllers/Customer/validateCustomerExists.controller");
const _sendEmail = require("../../controllers/Notifications/sendEmail");
const { resetPasswordHtml } = require("../../utils/templates/emails");

const forgorPassword = async (req, res) => {
  try {
    const { email } = req.body;

    //Validate if customer exits
    const customerExits = await _validateCustomerExists({ email });
    if(!customerExits){
        return res.status(409).json({success: false, message: `No existe usuario con el correo: ${email}`});
    }

    //Create hash to reset password
    const hash = await _createEmailVerificationHash(customerExits.customer_id, "reset-password");

    //Send email to reset password
    const template = resetPasswordHtml(customerExits.name, `${process.env.CLIENT_URL}/new-password/${hash}`)
    await _sendEmail(email, "VIGI | Restablecer tu contraseña", template);

    res.status(200).json({ success: true, message: "¡Listo! Por favor, revisa tu correo electrónico. Hemos enviado un mensaje con instrucciones detalladas sobre cómo restablecer tu contraseña."})
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = forgorPassword;
