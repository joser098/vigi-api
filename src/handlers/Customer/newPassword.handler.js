const verificationRepository = require("../../repositories/verification.repository");
const customerRepository = require("../../repositories/customer.repository");

const RESET_ERROR =
  "Ha ocurrido un error. Por favor, verifica que hayas solicitado restablecer tu contraseña o inténtalo de nuevo más tarde. Si el problema persiste, no dudes en ponerte en contacto con nuestro equipo de soporte para obtener ayuda adicional.";

const newPassword = async (req, res) => {
  try {
    const { hash } = req.params;
    const { password } = req.body;

    const record = await verificationRepository.consume(hash);

    if (!record) {
      return res.status(404).json({ success: false, message: RESET_ERROR });
    }

    const result = await customerRepository.updatePassword(
      record.customer_id,
      password
    );

    if (result.modified) {
      return res.status(201).json({
        success: true,
        message: "¡Tu contraseña se ha restablecido exitosamente!",
      });
    }

    return res.status(400).json({ success: false, message: RESET_ERROR });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = newPassword;
