const _validateEmailWithHash = require("../../controllers/Customer/validateEmailWithHash.controller");
const _updatePassword = require("../../controllers/Customer/updatePassword.constroller");

const newPassword = async (req, res) => {
  try {
    const { hash } = req.params;
    const { password } = req.body;

    const validateHash = await _validateEmailWithHash(hash);

    if (!validateHash._result) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "Ha ocurrido un error. Por favor, verifica que hayas solicitado restablecer tu contraseña o inténtalo de nuevo más tarde. Si el problema persiste, no dudes en ponerte en contacto con nuestro equipo de soporte para obtener ayuda adicional.",
        });
    }

    const update_password = await _updatePassword(
      validateHash.customer_id,
      password
    );

    if (update_password) {
      return res
        .status(201)
        .json({
          success: true,
          message:
            "¡Tu contraseña se ha restablecido exitosamente!",
        });
    }

    return res
      .status(400)
      .json({
        success: false,
        message:
          "Ha ocurrido un error. Por favor, verifica que hayas solicitado restablecer tu contraseña o inténtalo de nuevo más tarde. Si el problema persiste, no dudes en ponerte en contacto con nuestro equipo de soporte para obtener ayuda adicional.",
      });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = newPassword;
