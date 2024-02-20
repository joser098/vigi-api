const _getPayment = require("../../controllers/Payment/getPayment.controller");

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await _getPayment(id);

    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    return res.status(400).json({ error: error });
  }
};

module.exports = getPayment;
