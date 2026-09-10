const crypto = require("node:crypto");

/**
 * API de Conversiones de Meta: el mismo `Purchase` que dispara el navegador,
 * mandado desde acá cuando el pago se acredita.
 *
 * Por qué existe, con números de esta cuenta: al 10/09/2026 el píxel del
 * navegador había recibido 59 PageView y 10 ViewContent, y CERO compras. La
 * compra de prueba se hizo dos veces —una en Chrome, otra en Edge— y ninguna
 * llegó: los dos navegadores traen bloqueo de rastreadores de fábrica. El
 * código del píxel estaba bien; se comprobó que encola
 * `Purchase {value: 840, currency: ARS}` con su eventID. Lo que falla es el
 * canal, no la implementación.
 *
 * Desde el servidor no hay bloqueador que valga: el evento sale cuando Mercado
 * Pago acredita la plata, no cuando alguien mira una pantalla.
 *
 * **El `event_id` es lo que evita contar la venta dos veces.** Vale
 * `purchase_<id del pago>`, exactamente el mismo string que manda
 * `PurchasePixel.astro` en el navegador. Cuando los dos llegan, Meta los une y
 * cuenta una sola compra. Si alguna vez cambia de un lado, hay que cambiarlo
 * del otro.
 *
 * Variables de entorno:
 *
 *   META_DATASET_ID   El conjunto de datos, 378250695246633.
 *   META_CAPI_TOKEN   Token de usuario del sistema con permiso sobre ese
 *                     conjunto. Sin esto el módulo no hace nada y lo avisa una
 *                     sola vez: se puede desplegar antes de tener el token.
 *   META_CAPI_TEST    Opcional. El código del Probador de eventos. Con esto
 *                     puesto, el evento aparece en "Probar eventos" en vez de
 *                     contar como una conversión real. Sacalo cuando termines
 *                     de probar.
 */

const API_VERSION = "v21.0";

let yaAvisado = false;

/** Meta solo acepta los datos personales en sha256, en minúscula y sin espacios. */
const hash = (valor) => {
  if (valor === null || valor === undefined) return null;

  const limpio = String(valor).trim().toLowerCase();
  if (!limpio) return null;

  return crypto.createHash("sha256").update(limpio).digest("hex");
};

/**
 * El teléfono va solo con dígitos y con código de país. Los que carga el
 * checkout vienen como "11 2603 9243", sin el 54, así que se lo ponemos: un
 * número sin código de país no empareja con nadie.
 */
const hashTelefono = (telefono) => {
  if (!telefono) return null;

  let digitos = String(telefono).replace(/\D/g, "");
  if (!digitos) return null;

  if (digitos.length <= 10) digitos = `54${digitos}`;

  return hash(digitos);
};

/** Los ítems en la forma que espera Meta, la misma que usa el píxel. */
const contenidos = (items = []) =>
  items
    .filter((i) => i && (i.id ?? i.title))
    .map((i) => ({
      id: String(i.id ?? i.title),
      quantity: Number(i.quantity) || 1,
      item_price: Number(i.unit_price) || 0,
    }));

/**
 * Manda el Purchase. No tira nunca: medir no puede voltear una venta que ya
 * está cobrada y registrada.
 *
 * @returns {Promise<{ enviado: boolean, motivo?: string }>}
 */
const enviarCompra = async ({
  paymentId,
  valor,
  items = [],
  customer = null,
  ip = null,
  userAgent = null,
  fechaAprobado = null,
}) => {
  const datasetId = process.env.META_DATASET_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!datasetId || !token) {
    if (!yaAvisado) {
      yaAvisado = true;
      console.warn(
        "[meta-capi] falta META_DATASET_ID o META_CAPI_TOKEN: las compras no se " +
          "mandan al servidor. El píxel del navegador sigue funcionando."
      );
    }
    return { enviado: false, motivo: "sin configurar" };
  }

  if (typeof fetch !== "function") {
    console.warn("[meta-capi] este Node no tiene fetch global (hace falta 18+)");
    return { enviado: false, motivo: "sin fetch" };
  }

  const datos = customer?.user_data ?? {};
  const direccion = datos.address ?? {};

  // Cuantos más datos, mejor empareja Meta la compra con la persona que vio el
  // anuncio. Los que estén vacíos se caen solos abajo.
  const userData = {
    em: hash(customer?.email),
    ph: hashTelefono(datos.phone),
    fn: hash(datos.name),
    ln: hash(datos.last_name),
    zp: hash(direccion.zip_code),
    ct: hash(direccion.location),
    st: hash(direccion.province),
    country: hash("ar"),
    client_ip_address: ip || undefined,
    client_user_agent: userAgent || undefined,
  };

  for (const clave of Object.keys(userData)) {
    if (!userData[clave]) delete userData[clave];
  }

  // Sin un solo identificador Meta rechaza el evento entero. Mejor no gastar la
  // llamada y dejarlo escrito en el log.
  const identificadores = ["em", "ph", "client_ip_address"];
  if (!identificadores.some((c) => userData[c])) {
    console.warn(`[meta-capi] pago ${paymentId}: sin mail, teléfono ni IP, no se manda`);
    return { enviado: false, motivo: "sin identificadores" };
  }

  // La hora de la acreditación, no la de ahora: si el evento se manda desde la
  // conciliación al día siguiente, la fecha real es la del pago. Meta acepta
  // hasta siete días para atrás.
  const cuando = fechaAprobado ? Math.floor(new Date(fechaAprobado).getTime() / 1000) : null;

  const evento = {
    event_name: "Purchase",
    event_time: cuando && !Number.isNaN(cuando) ? cuando : Math.floor(Date.now() / 1000),
    event_id: `purchase_${paymentId}`,
    action_source: "website",
    event_source_url: `${process.env.CLIENT_URL ?? "https://www.vigi.com.ar"}/payment/${paymentId}`,
    user_data: userData,
    custom_data: {
      currency: "ARS",
      value: Number(valor) || 0,
      content_type: "product",
      contents: contenidos(items),
    },
  };

  const cuerpo = { data: [evento], access_token: token };
  if (process.env.META_CAPI_TEST) cuerpo.test_event_code = process.env.META_CAPI_TEST;

  try {
    const respuesta = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${datasetId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }
    );

    const resultado = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      console.error(
        `[meta-capi] pago ${paymentId}: Meta respondió ${respuesta.status}`,
        resultado?.error?.message ?? resultado
      );
      return { enviado: false, motivo: `http ${respuesta.status}` };
    }

    console.log(
      `[meta-capi] pago ${paymentId}: Purchase enviado por $${evento.custom_data.value}` +
        ` · recibidos ${resultado?.events_received ?? "?"}` +
        (process.env.META_CAPI_TEST ? " · MODO PRUEBA" : "")
    );

    return { enviado: true };
  } catch (error) {
    console.error(`[meta-capi] pago ${paymentId}: no se pudo enviar:`, error.message);
    return { enviado: false, motivo: error.message };
  }
};

module.exports = { enviarCompra };
