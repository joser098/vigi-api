const couponRepository = require("../../repositories/coupon.repository");

const removeCoupon = async (req, res) => {
  try {
    const { cart_id } = req.body;

    await couponRepository.setOnCart(cart_id, null);

    return res.status(200).json({ success: true, message: "Cupón quitado." });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = removeCoupon;
