const orderRepository = require("../../repositories/order.repository");

/**
 * ¿Este número de pedido es de "acordar envío"? Lo consulta el flujo de
 * WhatsApp (kapso/functions/vigi-acordar) antes de pasarle la charla a una
 * persona.
 *
 * Es público porque Kapso no tiene sesión del cliente, así que devuelve lo
 * mínimo: si existe, si es para acordar y el estado. Nada del cliente, ni
 * montos, ni productos.
 */
const getAcordarStatus = async (req, res) => {
  try {
    const paymentId = String(req.params.payment_id ?? "").trim();

    if (!/^[\w-]{4,64}$/.test(paymentId)) {
      return res.status(200).json({ success: true, data: { found: false } });
    }

    const order = await orderRepository.findByPaymentId(paymentId);

    return res.status(200).json({
      success: true,
      data: order
        ? {
            found: true,
            acordar: order.delivery_type === "A",
            status: order.status,
            status_label: order.status_label,
          }
        : { found: false },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getAcordarStatus;
