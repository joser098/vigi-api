const cartRepository = require("../../repositories/cart.repository");
const couponRepository = require("../../repositories/coupon.repository");
const { evaluateCoupon, toPublic } = require("../../services/coupons");

/**
 * Guarda el cupón en el carrito.
 *
 * Lo que devuelve es informativo: el descuento que se cobra lo recalcula
 * `createPaymentOrder` con las mismas reglas. Acá lo único que persiste es
 * *cuál* cupón eligió el cliente, nunca cuánto descuenta.
 */
const applyCoupon = async (req, res) => {
  try {
    const { cart_id, customer_id, code } = req.body;

    if (!code || !String(code).trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Escribí un código de cupón." });
    }

    const cart = await cartRepository.findById(cart_id);

    if (!cart) {
      return res
        .status(404)
        .json({ success: false, message: "No encontramos tu carrito." });
    }

    const coupon = await couponRepository.findByCode(code);

    const subtotal = cart.items.reduce(
      (total, i) => total + i.unit_price * i.quantity,
      0
    );

    const customerRedemptions = coupon
      ? await couponRepository.countRedemptionsByCustomer(coupon.id, customer_id)
      : 0;

    const resultado = evaluateCoupon(coupon, { subtotal, customerRedemptions });

    if (!resultado.valid) {
      // 200 y no 4xx: un cupón vencido no es un error del cliente ni de la
      // request, es una respuesta de negocio que la UI tiene que mostrar.
      return res.status(200).json({
        success: false,
        reason: resultado.reason,
        message: resultado.message,
      });
    }

    await couponRepository.setOnCart(cart_id, coupon.id);

    return res.status(200).json({
      success: true,
      message: "Cupón aplicado.",
      data: toPublic(coupon, resultado.discount),
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = applyCoupon;
