const _getProvinces = require("../../controllers/Search/getProvinces.controller");

const getProvinces = async (req, res) => {
  try {
    const provinces = await _getProvinces();

    res.status(200).json({ success: true, data: provinces });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = getProvinces;
