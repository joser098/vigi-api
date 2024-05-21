const _getCarruselImages = require("../../controllers/Search/getCarruselImages.controller");

const getCarruselImages = async (req, res) => {
  try {
    const response = await _getCarruselImages();
    const obj = {
      images: response[0].images,
      length: response[0].images.length,
    }

    res.status(200).json({ succes: true, data: obj });
  } catch (error) {
    return res.status(500).json({ succes: false, message: error.message });
  }
};

module.exports = getCarruselImages;
