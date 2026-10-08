// "Acordar envío de mi compra" en el workflow vigi-atencion.
//
// El cliente eligió "acordar el envío" en el checkout: pagó solo los productos
// y tiene que escribir acá con su número de pedido para coordinar dónde se lo
// llevamos en CABA. Esta función saca el número del mensaje, lo valida contra
// la API (GET /api/order/acordar/:id, que no devuelve datos del cliente) y
// devuelve el camino:
//
//   ok             es un pedido con envío a acordar → se pasa a una persona.
//                  También si la API no responde: mejor que una persona lo
//                  revise a mano que dejar al cliente trabado.
//   no_es_acordar  el pedido existe pero va por Correo: se le explica.
//   no_encontrado  no hay número en el mensaje o no existe ese pedido.
//   timeout        no contestó.
//
// Llega por dos lados: después de pedirle el número (menú → "Acordar envío de
// mi compra"), o directo desde el link del mail de compra, que manda "Hola!
// Quiero acordar el envío de mi pedido <id>" (vigi-api/src/utils/whatsapp.js).

const API = "https://vigi-api-production-31a2.up.railway.app/api";

const responder = (next_edge, vars = {}) =>
  new Response(JSON.stringify({ next_edge, vars }), {
    headers: { "Content-Type": "application/json" },
  });

/**
 * El número de pedido: lo que sigue a "pedido", o si no, el primer grupo de
 * dígitos largo (los de Mercado Pago tienen 10 u 11). Acepta "#123", "nro 123"
 * o el número solo.
 */
const numeroDe = (texto) => {
  const t = String(texto ?? "");
  const tras = t.match(/pedido\s*(?:n(?:ro|°|º)?\.?\s*)?#?\s*([\w-]{4,64})/i);
  if (tras && /\d/.test(tras[1])) return tras[1];
  return t.match(/\d{6,}/)?.[0] ?? null;
};

async function handler(request, env) {
  const body = await request.json();
  const edges = body.available_edges || [];
  const system = body.execution_context?.system || {};

  if (system.last_resume?.reason === "timeout" && edges.includes("timeout")) {
    return responder("timeout");
  }

  const mensajes = body.whatsapp_context?.messages || [];
  const ultimo = [...mensajes].reverse().find((m) => m.direction === "inbound");
  const numero = numeroDe(ultimo?.content);

  if (!numero) return responder("no_encontrado", { pedido_acordar: "" });

  try {
    const r = await fetch(`${API}/order/acordar/${encodeURIComponent(numero)}`);
    const data = (await r.json())?.data;

    if (!r.ok || !data) throw new Error(`API ${r.status}`);
    if (!data.found) return responder("no_encontrado", { pedido_acordar: numero });
    if (!data.acordar) {
      return responder("no_es_acordar", {
        pedido_acordar: numero,
        pedido_estado: data.status_label || data.status || "",
      });
    }
    return responder("ok", { pedido_acordar: numero });
  } catch {
    return responder("ok", { pedido_acordar: numero });
  }
}
