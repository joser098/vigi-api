const customerRepository = require("../../repositories/customer.repository");
const cartRepository = require("../../repositories/cart.repository");
const { buildTotals } = require("../../services/checkout");
const {
  formatAddress,
  FREE_SHIPPING_MIN_PURCHASE,
} = require("../../services/shipping");

const round = (amount) => Math.round(amount * 100) / 100;

const getShippingCosts = async (req, res) => {
  try {
    const { customer_id, cart_id } = req.body;

    const customer = await customerRepository.findById(customer_id);
    const { address } = customer.user_data;

    // El costo ya no depende solo de la dirección: hay un mínimo de compra
    // para el envío gratis, y el cupón puede bajar el subtotal por debajo.
    const cart = await cartRepository.findById(cart_id);
    const totals = await buildTotals({
      cart: cart ?? { items: [], coupon: null },
      customer_id,
      address,
    });

    return res.status(200).json({
      success: true,
      data: {
        address: formatAddress(address),
        // Nombre histórico: el frontend lo lee así desde siempre.
        shippingCost: totals.shipping.cost,
        free: totals.shipping.free,
        // El carrito recuerda la forma de entrega, así que la pantalla la lee
        // de acá en vez de arrancar siempre en "envío a domicilio".
        local_pickup: Boolean(cart?.local_pickup),
        // "caba" o "min_purchase" cuando es gratis; null cuando se cotizó.
        reason: totals.shipping.reason,
        subtotal: totals.subtotal,
        discount: totals.discount,
        coupon: totals.coupon,
        coupon_error: totals.couponError,
        amount_to_pay: totals.amount_to_pay,
        free_shipping_min: FREE_SHIPPING_MIN_PURCHASE,
        // Cuánto falta para el envío gratis, para poder empujar el carrito.
        // 0 cuando ya llegó o cuando la zona no paga envío.
        missing_for_free: totals.shipping.free
          ? 0
          : round(Math.max(FREE_SHIPPING_MIN_PURCHASE - totals.subtotal, 0)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getShippingCosts;
