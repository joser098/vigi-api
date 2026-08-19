const { isUuid } = require("../db/uuid");

/**
 * De dónde sale el customer_id de un pago de Mercado Pago.
 *
 * Vive acá y no en `services/payments` porque lo necesitan tanto el servicio
 * como el repositorio, y el servicio ya usa el repositorio: ponerlo en
 * cualquiera de los dos armaba un require circular.
 *
 * Históricamente el id viajaba dentro de `payer.last_name` de la preferencia,
 * que es un lugar frágil —es un campo de nombre, y MP no garantiza devolver
 * `additional_info` en todas las respuestas—. Desde ahora se manda también en
 * `metadata`, que es el canal previsto, y se lee primero de ahí. El fallback
 * mantiene funcionando los pagos creados antes del cambio.
 */
const customerIdDe = (payment) => {
  const candidatos = [
    payment?.metadata?.customer_id,
    payment?.additional_info?.payer?.last_name,
  ];

  return candidatos.find((c) => isUuid(c)) ?? null;
};

/**
 * Saca el id del pago de una notificación de Mercado Pago.
 *
 * MP tiene tres formatos vivos al mismo tiempo y manda unos u otros según cómo
 * esté configurada la integración:
 *
 *   Webhooks v2  body   { type: "payment", data: { id } }
 *   Webhooks v2  query  ?type=payment&data.id=123
 *   IPN          query  ?topic=payment&id=123
 *
 * El handler viejo leía SOLO la segunda. Con la primera —que es la que manda MP
 * hoy— `req.query.type` venía undefined, contestaba 200 y no hacía nada: MP la
 * daba por entregada y la venta se perdía en silencio. Reproducido contra
 * producción antes de escribir esto.
 *
 * @returns {{ esPago: boolean, id: string|null }}
 */
const parseMercadoPagoNotification = (req) => {
  const q = req.query ?? {};
  const b = req.body ?? {};

  const tipo = q.type ?? q.topic ?? b.type ?? b.topic ?? null;

  // `merchant_order` y demás no se procesan, pero tampoco son un error.
  if (tipo && !String(tipo).includes("payment")) {
    return { esPago: false, id: null };
  }

  const id =
    q["data.id"] ??
    q.id ??
    b.data?.id ??
    // `b.id` es el id de la NOTIFICACIÓN, no el del pago: solo sirve cuando no
    // vino un `data`, que es el formato IPN mandado por body.
    (b.data === undefined ? b.id : undefined) ??
    // IPN viejo manda la URL del recurso en vez del id pelado.
    (typeof b.resource === "string" ? b.resource.split("/").pop() : null) ??
    null;

  // Sin tipo pero con id: MP a veces manda `?id=..&topic=..` y a veces el body
  // solo. Si hay algo que parece un id de pago, se intenta.
  return { esPago: Boolean(id), id: id ? String(id) : null };
};

module.exports = { customerIdDe, parseMercadoPagoNotification };
