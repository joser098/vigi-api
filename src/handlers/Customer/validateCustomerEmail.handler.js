const verificationRepository = require("../../repositories/verification.repository");
const customerRepository = require("../../repositories/customer.repository");
const { joinUrl } = require("../../utils/urls");

const validateCustomerEmail = async (req, res) => {
  try {
    const { hash } = req.params;

    const record = await verificationRepository.consume(hash);

    if (record) {
      await customerRepository.activate(record.customer_id);

      return res.redirect(joinUrl(process.env.CLIENT_URL, "/email-success"));
    }

    return res.redirect(joinUrl(process.env.CLIENT_URL, "/email-error"));
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = validateCustomerEmail;
