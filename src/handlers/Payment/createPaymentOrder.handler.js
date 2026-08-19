const customerRepository = require("../../repositories/customer.repository");
const _createPaymentOrderMePa = require("../../controllers/Payment/createPaymentOrder.controller");
const _createPaymentOrderNave = require("../../controllers/Payment/nave/createPaymentOrderNave.controller");
const _getBearerToken = require("../../controllers/Payment/nave/getBearerToken.controller");
const cartRepository = require("../../repositories/cart.repository");
const couponRepository = require("../../repositories/coupon.repository");
const { buildTotals } = require("../../services/checkout");

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

    // Ítems con el descuento del cupón ya repartido, más envío: los mismos
    // números que devolvió el cotizador, salidos de la misma función. El cupón
    // se vuelve a validar acá, así que uno que venció mientras el carrito
    // estaba abierto no se cobra con descuento.
    const totals = await buildTotals({
      cart,
      customer_id,
      address: payer.user_data.address,
    });

    // Queda anotado en el carrito cuánto descuento se aplicó: el webhook llega
    // después y solo trae ítems ya descontados, así que sin esto la orden no
    // podría registrar el cupón ni contar el canje.
    await couponRepository.setCartDiscount(cart_id, totals.discount);

    let paymentOrder;
    if (method == "nv") {
      //Get bearer_token
      const bearer_token = await _getBearerToken();

      paymentOrder = await _createPaymentOrderNave(
        bearer_token,
        payer,
        totals.items,
        totals.amount_to_pay
      );
      paymentOrder.init_point = paymentOrder.checkout_url;
    } else {
      paymentOrder = await _createPaymentOrderMePa(payer, totals.items, {
        cost: totals.shipping.cost,
        mode: "not_specified",
      });
    }

    return res.status(200).json({ success: true, data: paymentOrder });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
module.exports = createPaymentOrder;
