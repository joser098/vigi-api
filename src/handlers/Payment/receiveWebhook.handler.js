const { recordMercadoPagoPayment } = require("../../services/payments");
const { parseMercadoPagoNotification } = require("../../utils/mpPayment");

/**
 * Webhook de Mercado Pago.
 *
 * Todo el trabajo está en `services/payments`, compartido con la vuelta del
 * cliente y con la conciliación. Acá solo queda entender la notificación y
 * elegir el código de respuesta, que no es un detalle: MP reintenta con 5xx y
 * da por entregada cualquier 2xx. Devolver 200 cuando algo salió mal es perder
 * la venta y encima quedarse sin el reintento.
 */
const receiveWeebhook = async (req, res) => {
  const { esPago, id } = parseMercadoPagoNotification(req);

  // Notificaciones que no son de pago (merchant_order, etc.): no las
  // procesamos, pero están bien entregadas.
  if (!esPago) return res.status(200).send();

  try {
    const resultado = await recordMercadoPagoPayment(id);

    console.log(
      `[mp-webhook] pago ${id}: ${resultado.status}` +
        (resultado.order_created
          ? " · orden creada"
          : ` · sin orden (${resultado.reason ?? "ya existía"})`)
    );

    return res.status(200).send();
  } catch (error) {
    // 500 a propósito: que MP reintente. Con 400 la notificación se da por
    // entregada y no vuelve nunca más.
    console.error(
      `[mp-webhook] FALLÓ el pago ${id}:`,
      error.message,
      JSON.stringify({ query: req.query, body: req.body })
    );

    return res.status(500).json({ message: error.message });
  }
};

module.exports = receiveWeebhook;
