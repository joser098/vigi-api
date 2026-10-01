const cartRepository = require("../../repositories/cart.repository");

/**
 * Forma de entrega del carrito.
 *
 * El retiro en oficina se dio de baja: solo queda el envío, así que se rechaza
 * `local_pickup: true`. El checkout además ignora la columna (services/checkout),
 * por si algún carrito quedó con el valor viejo.
 */
const setDelivery = async (req, res) => {
  try {
    const { cart_id, local_pickup } = req.body;

    if (typeof local_pickup !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "local_pickup debe ser booleano" });
    }

    if (local_pickup) {
      return res
        .status(400)
        .json({ success: false, message: "El retiro en oficina no está disponible" });
    }

    await cartRepository.setLocalPickup(cart_id, local_pickup);

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = setDelivery;
