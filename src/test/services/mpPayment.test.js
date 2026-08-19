// El parseo de la notificación de Mercado Pago.
//
// Esto tiene test propio porque su versión anterior costó una venta: leía solo
// la query string, y con el formato que MP manda hoy —todo en el body—
// contestaba 200 sin hacer nada. MP la daba por entregada y no reintentaba.
const { parseMercadoPagoNotification } = require("../../utils/mpPayment");

const req = (query = {}, body = {}) => ({ query, body });

describe("parseMercadoPagoNotification", () => {
  it("lee Webhooks v2 con todo en el body (el formato que rompió)", () => {
    expect(
      parseMercadoPagoNotification(
        req({}, { action: "payment.created", type: "payment", data: { id: "123456" } })
      )
    ).toEqual({ esPago: true, id: "123456" });
  });

  it("lee Webhooks v2 con los datos en la query", () => {
    expect(
      parseMercadoPagoNotification(req({ type: "payment", "data.id": "123456" }))
    ).toEqual({ esPago: true, id: "123456" });
  });

  it("lee el IPN viejo (topic + id en la query)", () => {
    expect(
      parseMercadoPagoNotification(req({ topic: "payment", id: "123456" }))
    ).toEqual({ esPago: true, id: "123456" });
  });

  it("lee el IPN que manda la URL del recurso", () => {
    expect(
      parseMercadoPagoNotification(
        req({}, { topic: "payment", resource: "https://api.mercadolibre.com/collections/notifications/123456" })
      )
    ).toEqual({ esPago: true, id: "123456" });
  });

  it("ignora las notificaciones que no son de pago", () => {
    expect(
      parseMercadoPagoNotification(req({ topic: "merchant_order", id: "999" }))
    ).toEqual({ esPago: false, id: null });

    expect(
      parseMercadoPagoNotification(req({}, { type: "plan", data: { id: "999" } }))
    ).toEqual({ esPago: false, id: null });
  });

  it("no confunde el id de la notificación con el del pago", () => {
    // En v2 el `id` de arriba es el de la notificación; el del pago está en
    // `data.id`. Tomar el equivocado hace pedirle a MP un pago que no existe.
    expect(
      parseMercadoPagoNotification(
        req({}, { id: 111111, type: "payment", data: { id: "222222" } })
      )
    ).toEqual({ esPago: true, id: "222222" });
  });

  it("no inventa un pago cuando no hay ningún id", () => {
    expect(parseMercadoPagoNotification(req({}, {}))).toEqual({
      esPago: false,
      id: null,
    });
  });

  it("aguanta una request sin query ni body", () => {
    expect(parseMercadoPagoNotification({})).toEqual({ esPago: false, id: null });
  });
});
