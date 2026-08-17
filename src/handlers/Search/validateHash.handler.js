const verificationRepository = require("../../repositories/verification.repository");

const validateHash = async (req, res) => {
  try {
    const { hash } = req.params;

    // Checks without consuming: the reset form needs to know the link is good
    // before the customer submits a new password.
    const isHashValid = await verificationRepository.exists(hash);

    if (isHashValid) {
      return res.status(200).json({ success: true });
    }

    return res.status(498).json({ success: false });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = validateHash;
