const paymentRepository = require("../../repositories/payment.repository");

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await paymentRepository.findByGatewayPaymentId(id);

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    return res.status(400).json({ error: error });
  }
};

module.exports = getPayment;
