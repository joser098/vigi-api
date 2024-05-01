const _validateEmailWithHash = require("../../controllers/Customer/validateEmailWithHash.controller");

const validateCustomerEmail = async (req, res) => {
  try {
    const { hash } = req.params;

    const validation = await _validateEmailWithHash(hash);

    if(validation){
      return res.status(200).redirect(`https://www.vigi.cam/email-success`);
    }

    return res.redirect(`https://www.vigi.cam/email-error`);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message})
  }
};

module.exports = validateCustomerEmail;
