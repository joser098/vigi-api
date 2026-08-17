const customerRepository = require("../../repositories/customer.repository");
const verificationRepository = require("../../repositories/verification.repository");
const { resetPasswordHtml } = require("../../utils/templates/emails");
const sendEmail = require("../../controllers/Notifications/sendEmail");
const senders = require("../../utils/senders");

const forgorPassword = async (req, res) => {
  try {
    const { email } = req.body;

    //Validate if customer exits
    const customer = await customerRepository.findByEmail(email);
    if (!customer) {
      return res.status(409).json({
        success: false,
        message: `No existe usuario con el correo: ${email}`,
      });
    }

    //Create hash to reset password
    const hash = await verificationRepository.create(
      customer.id,
      "reset-password"
    );

    //Send email to reset password
    const template = resetPasswordHtml(
      customer.user_data.name,
      `${process.env.CLIENT_URL}/new-password/${hash}`
    );
    await sendEmail(
      email,
      senders.noreply,
      "VIGI | Restablecer tu contraseña",
      template
    );

    res.status(200).json({
      success: true,
      message:
        "¡Listo! Por favor, revisa tu correo electrónico. Hemos enviado un mensaje con instrucciones detalladas sobre cómo restablecer tu contraseña.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = forgorPassword;
