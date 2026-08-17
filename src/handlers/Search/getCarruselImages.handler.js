const referenceRepository = require("../../repositories/reference.repository");

const getCarruselImages = async (req, res) => {
  try {
    // Mongo kept a single document holding an images array; the table holds one
    // row per image, so the array is rebuilt here to keep the response stable.
    const images = await referenceRepository.findCarruselImages();

    res
      .status(200)
      .json({ succes: true, data: { images, length: images.length } });
  } catch (error) {
    return res.status(500).json({ succes: false, message: error.message });
  }
};

module.exports = getCarruselImages;
