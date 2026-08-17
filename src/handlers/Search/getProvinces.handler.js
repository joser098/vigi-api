const referenceRepository = require("../../repositories/reference.repository");

const getProvinces = async (req, res) => {
  try {
    const provinces = await referenceRepository.findProvinces();

    res.status(200).json({ success: true, data: provinces });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = getProvinces;
