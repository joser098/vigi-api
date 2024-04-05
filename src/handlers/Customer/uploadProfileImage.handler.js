const fs = require("fs");
const awsUpload = require("../../services/awsUpload");
const _getCustomerById = require("../../controllers/Customer/getCustomerById.controller");
const _updateProfileImage = require("../../controllers/Customer/updateProfileImage.controller");

const uploadProfileImage = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { username, profile_image } = await _getCustomerById(customer_id);

    //Save image in S3 Bucket
    await awsUpload(req.file, customer_id, username);

    //Delete file from server
    fs.unlinkSync(req.file.path);

    //Save image url in database
    if (profile_image === "") {
      const NEW_IMAGE_URL = `${process.env.AWS_CLOUDFRONT_URL}/profile/${customer_id}-${username}.png`;
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
