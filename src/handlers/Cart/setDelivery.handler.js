const cartRepository = require("../../repositories/cart.repository");
const customerRepository = require("../../repositories/customer.repository");
const { agenciesForAddress } = require("../Logistics/getAgencies.handler");

/**
 * Forma de entrega del carrito: Correo Argentino a domicilio (`D`), retiro en
 * una sucursal (`S`, con `agency_code`) o acordar el envío (`A`, no se cobra;
 * ver services/shipping).
 *
 * Se guarda en el carrito y no viaja en el body del pago porque cambia el
 * total. De la sucursal solo se acepta el código: el resto se toma de MiCorreo
 * y se verifica que sea una sucursal de la provincia del cliente que entregue
 * paquetes.
 *
 * El retiro en oficina se dio de baja: se sigue rechazando `local_pickup: true`,
 * y `local_pickup: false` de un frontend viejo equivale a domicilio.
 */
const setDelivery = async (req, res) => {
  try {
    const { cart_id, customer_id, local_pickup, agency_code } = req.body;
    let { delivery_type } = req.body;

    if (local_pickup === true) {
      return res
        .status(400)
        .json({ success: false, message: "El retiro en oficina no está disponible" });
    }

    if (delivery_type === undefined && local_pickup === false) delivery_type = "D";

    if (!["D", "S", "A"].includes(delivery_type)) {
      return res
        .status(400)
        .json({ success: false, message: "delivery_type debe ser 'D', 'S' o 'A'" });
    }

    let agency = null;

    if (delivery_type === "S") {
      if (!agency_code) {
        return res
          .status(400)
          .json({ success: false, message: "Elegí una sucursal" });
      }

      const customer = await customerRepository.findById(customer_id);
      const agencies = await agenciesForAddress(customer?.user_data?.address);
      const found = agencies.find((a) => a.code === String(agency_code));

      if (!found) {
        return res.status(400).json({
          success: false,
          message: "Esa sucursal no está disponible para tu dirección",
        });
      }

      // La lista de CPs cercanos sirve para ordenar, no para el pedido.
      const { near_postal_codes, near, ...snapshot } = found;
      agency = snapshot;
    }

    await cartRepository.setDelivery(cart_id, delivery_type, agency);

    return res.status(200).json({ success: true, data: { delivery_type, agency } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = setDelivery;
