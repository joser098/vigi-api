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
        // Siempre false: el retiro en oficina se dio de baja. Se sigue
        // mandando para no romper un frontend viejo que todavía lo lea.
        local_pickup: false,
        // "caba" o "min_purchase" cuando lo elegido salió gratis; null cuando
        // se cobra.
        reason: totals.shipping.reason,
        // `delivery_type` es lo elegido ("D" domicilio, "S" sucursal, "A"
        // acordar; si no eligió, "D"), `options` trae las cotizaciones de
        // Correo ({ price, list_price, days_min, days_max } o null si no hay),
        // y `agency` la sucursal elegida. Si Correo no cotizó, `options` es
        // null, `quote_error` dice por qué y `shippingCost` es null salvo con
        // "A": el checkout ofrece acordar el envío.
        delivery_type: totals.shipping.delivery_type,
        quote_error: totals.shipping.quote_error,
        options: totals.shipping.options,
        agency: totals.shipping.agency,
        // Por qué hay envío gratis para este carrito, se elija o no: "caba"
        // (domicilio y sucursal) o "min_purchase" (solo sucursal).
        free_reason: totals.shipping.free_reason,
        valid_to: totals.shipping.valid_to,
        subtotal: totals.subtotal,
        discount: totals.discount,
        coupon: totals.coupon,
        coupon_error: totals.couponError,
        amount_to_pay: totals.amount_to_pay,
        free_shipping_min: FREE_SHIPPING_MIN_PURCHASE,
        // Cuánto falta para que la sucursal salga gratis, para poder empujar
        // el carrito. 0 cuando ya llegó o en CABA, donde no se paga.
        missing_for_free: totals.shipping.free_reason
          ? 0
          : round(Math.max(FREE_SHIPPING_MIN_PURCHASE - totals.subtotal, 0)),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getShippingCosts;
