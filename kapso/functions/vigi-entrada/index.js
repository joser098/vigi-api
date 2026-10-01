// Primer paso del workflow vigi-atencion: decide por dónde empieza la charla.
//
//   producto  el cliente llegó desde el botón de WhatsApp de una ficha de la
//             web, con el mensaje armado "Hola! Tengo una consulta sobre el
//             producto <modelo>". Se busca el producto para responderle con
//             el nombre, el precio y el link.
//   m_humano  llegó desde "Consultar por este pedido" en su cuenta de la web
//             ("Hola! Consulto por mi pedido <id>"): una consulta sobre un
//             pedido concreto la tiene que ver una persona.
//   m_recomendar  llegó desde "Asesorate" del header de la web ("Hola! Quiero
//             asesoramiento para elegir"): arranca en "Ayuda para elegir".
//   m_*       tocó un botón de un menú de una charla que ya había terminado:
//             se lo lleva directo a esa sección en vez de saludar de nuevo.
//   menu      todo lo demás: saludo y menú principal.

const API = "https://vigi-api-production-31a2.up.railway.app/api";
const TIENDA = "https://www.vigi.com.ar";

const responder = (next_edge, vars = {}) =>
  new Response(JSON.stringify({ next_edge, vars }), {
    headers: { "Content-Type": "application/json" },
  });

const pesos = (n) => "$" + Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function handler(request, env) {
  const body = await request.json();
  const edges = body.available_edges || [];
  const mensajes = body.whatsapp_context?.messages || [];
  const ultimo = [...mensajes].reverse().find((m) => m.direction === "inbound");

  const id = ultimo?.reply_option_id;
  if (id && edges.includes(id)) return responder(id);

  const pedido = String(ultimo?.content ?? "").match(/consulto por mi pedido\s+(\S+)/i);
  if (pedido && edges.includes("m_humano")) {
    return responder("m_humano", { pedido_consultado: pedido[1] });
  }

  if (/quiero asesoramiento/i.test(String(ultimo?.content ?? "")) && edges.includes("m_recomendar")) {
    return responder("m_recomendar");
  }

  const m = String(ultimo?.content ?? "").match(/consulta sobre (?:el producto\s+)?(.+?)\s*$/i);
  if (m && edges.includes("producto")) {
    try {
      const r = await fetch(`${API}/search/getProduct?model=${encodeURIComponent(m[1])}`);
      const p = (await r.json())?.data;
      if (p?.model) {
        return responder("producto", {
          producto_titulo: p.title || p.model,
          producto_precio: pesos(p.price),
          producto_url: `${TIENDA}/product/${encodeURIComponent(p.model)}`,
        });
      }
    } catch {
      // Si la API no responde, se saluda normal: mejor el menú que un error.
    }
  }

  return responder("menu");
}
