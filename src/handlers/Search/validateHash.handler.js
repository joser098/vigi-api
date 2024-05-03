const _validateHash = require("../../controllers/Search/validateHash.controller");

const validateHash = async (req, res) => {
  try {
    const { hash } = req.params;

    const isHashValid = await _validateHash(hash);

    if (isHashValid) {
      return res.status(200).json({ success: true });
    }

    return res.status(498).json({ success: false });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = validateHash;
