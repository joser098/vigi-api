const fs = require("fs");
const uploadImage = require("../../services/uploadImage");
const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _updateProfileImage = require("../../controllers/Customer/updateProfileImage.controller");

const uploadProfileImage = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { username, profile_image } = await _getCustomerById(customer_id);

    //Save image in R2 Bucket
    const NEW_IMAGE_URL = await uploadImage(req.file, customer_id, username);

    //Delete file from server
    fs.unlinkSync(req.file.path);

    //Save image url in database
    if (profile_image === "") {
      const saveUrl = await _updateProfileImage(customer_id, NEW_IMAGE_URL);

      if (!saveUrl.acknowledged) {
        return res.status(400).json({ error: "Error updating image" });
      }
    }

    return res
      .status(200)
      .json({ success: true, message: "Image uploaded successfully" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = uploadProfileImage;
