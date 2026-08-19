const { recordMercadoPagoPayment } = require("../../services/payments");
const { joinUrl } = require("../../utils/urls");

/**
 * Vuelta del comprador desde Mercado Pago (`back_urls`).
 *
 * Además de redirigir, registra el pago. Es la segunda red: si el webhook se
 * perdió, el navegador del propio cliente cierra el círculo, y encima lo hace
 * justo cuando el cliente está mirando la pantalla de "listo".
 *
 * El registro no puede voltear el redirect. Si falla, se loguea y el cliente
 * igual llega a su pantalla: dejarlo con un error en blanco después de haber
 * pagado es peor que una orden que la conciliación va a levantar igual.
 */
const feedback = async (req, res) => {
  const { payment_id, status, collection_id, collection_status } = req.query;

  // MP manda los nombres nuevos o los viejos según la versión del checkout.
  const id = payment_id && payment_id !== "null" ? payment_id : collection_id;
  const estado = status ?? collection_status ?? null;

  try {
    if (id && id !== "null") {
      const resultado = await recordMercadoPagoPayment(id);
      console.log(
        `[mp-feedback] pago ${id}: ${resultado.status}` +
          (resultado.order_created ? " · orden creada acá" : " · ya estaba")
      );
    }
  } catch (error) {
    console.error(
      `[mp-feedback] no se pudo registrar el pago ${id}:`,
      error.message
    );
  }

  try {
    // Todos los estados van a la misma pantalla, que muestra lo que pasó.
    // Antes un pago rechazado se redirigía a /profile sin una palabra: el
    // cliente se quedaba sin saber si había comprado o no.
    if (id && id !== "null") {
      return res.status(200).redirect(joinUrl(process.env.CLIENT_URL, `/payment/${id}`));
    }

    return res.status(200).redirect(joinUrl(process.env.CLIENT_URL, "/profile"));
  } catch (error) {
    return res.status(400).redirect(joinUrl(process.env.CLIENT_URL));
  }
};

module.exports = feedback;
