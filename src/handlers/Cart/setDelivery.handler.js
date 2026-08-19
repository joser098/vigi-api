const cartRepository = require("../../repositories/cart.repository");

/**
 * Guarda si el pedido se retira en oficina o se envía.
 *
 * Es la misma regla que el cupón: cualquier cosa que baje el total vive en la
 * base y no en el request. El resumen del carrito lo elige, el checkout lo
 * relee.
 */
const setDelivery = async (req, res) => {
  try {
    const { cart_id, local_pickup } = req.body;

    if (typeof local_pickup !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "local_pickup debe ser booleano" });
    }

    await cartRepository.setLocalPickup(cart_id, local_pickup);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = setDelivery;
