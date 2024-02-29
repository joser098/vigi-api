const _validateLogin = require("../../controllers/Customer/validateLogin.controller");
const { validateLogin } = require("../../services/zod_schemas/login_validation");

const login = async (req, res) => {
  try {
    const validation = validateLogin(req.body);

    if (!validation.success) {
      return res.status(400).json({success: false, message: validation.error.issues[0].message });
    }

    const { email, password } = validation.data;
    const loginValidation = await _validateLogin(email, password);

    //TODO: Send login email to user
    return res.status(200).json({ success: true, data: loginValidation });
  } catch (error) {
    let status;
    switch (error.message) {
      case "Email or password is incorrect":
        status = 404;
        break;
      default:
        status = 500;
        break;
    }

    return res.status(status).json({success: false, message: error.message });
  }
};
module.exports = login;
