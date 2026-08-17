const customerRepository = require("../../repositories/customer.repository");
const _createPaymentOrderMePa = require("../../controllers/Payment/createPaymentOrder.controller");
const _createPaymentOrderNave = require("../../controllers/Payment/nave/createPaymentOrderNave.controller");
const _getBearerToken = require("../../controllers/Payment/nave/getBearerToken.controller");
const cartRepository = require("../../repositories/cart.repository");
const { calculateShippingCost } = require("../../services/shipping");

const round = (amount) => Math.round(amount * 100) / 100;

const createPaymentOrder = async (req, res) => {
  try {
    // Only the payment method comes from the request. Everything carrying a
    // price is read server-side from the cart, so the charged amount cannot be
    // forged. customer_id and cart_id are injected by userAuth from the JWT.
    const { customer_id, cart_id, method } = req.body;

    const payer = await customerRepository.findById(customer_id);
    const cart = await cartRepository.findById(cart_id);

    if (!cart || cart.items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "El carrito está vacío" });
    }

    const items = cart.items;

    const itemsTotal = items.reduce(
      (total, item) => total + item.unit_price * item.quantity,
      0
    );
    const shippingCost = await calculateShippingCost(payer.user_data.address);
    const amount_to_pay = round(itemsTotal + shippingCost);

    let paymentOrder;
    if (method == "nv") {
      //Get bearer_token
      const bearer_token = await _getBearerToken();

      paymentOrder = await _createPaymentOrderNave(
        bearer_token,
        payer,
        items,
        amount_to_pay
      );
      paymentOrder.init_point = paymentOrder.checkout_url;
    } else {
      paymentOrder = await _createPaymentOrderMePa(payer, items, {
        cost: shippingCost,
        mode: "not_specified",
      });
    }

    return res.status(200).json({ success: true, data: paymentOrder });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = createPaymentOrder;
