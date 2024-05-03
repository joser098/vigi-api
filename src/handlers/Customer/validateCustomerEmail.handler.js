const _validateEmailWithHash = require("../../controllers/Customer/validateEmailWithHash.controller");

const validateCustomerEmail = async (req, res) => {
  try {
    const { hash } = req.params;

    const validation = await _validateEmailWithHash(hash, true);

    if(validation){
      return res.status(200).redirect(`${process.env.CLIENT_URL}/email-success`);
    }

    return res.redirect(`${process.env.CLIENT_URL}/email-error`);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message})
  }
};

module.exports = validateCustomerEmail;
