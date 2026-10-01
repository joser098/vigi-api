// Ruteo de cada pregunta del workflow vigi-atencion.
//
// Lo usan todos los nodos decide que vienen después de un menú. Mira la
// última respuesta del cliente y devuelve la etiqueta del camino a seguir:
//
//   1. El id exacto del botón o fila que tocó ("m_envios").
//   2. Si no, el prefijo del id ("cat_kits" → "cat"): así varias opciones
//      que siguen igual comparten un solo camino.
//   3. Si escribió en vez de tocar, unas pocas palabras clave ("persona",
//      "menú").
//   4. "otro": el workflow le vuelve a mostrar las opciones.
//
// Un botón viejo (de un mensaje anterior) cae en "otro", no en un camino que
// ya no corresponde.
//
// Además guarda en vars lo que eligió en el recomendador (cat_, loc_, pow_,
// bud_) para que vigi-recomendar arme la búsqueda.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const responder = (next_edge, vars = {}) =>
  new Response(JSON.stringify({ next_edge, vars }), {
    headers: { "Content-Type": "application/json" },
  });

async function handler(request, env) {
  const body = await request.json();
  const edges = body.available_edges || [];
  const system = body.execution_context?.system || {};
  const tiene = (e) => edges.includes(e);

  if (system.last_resume?.reason === "timeout" && tiene("timeout")) {
    return responder("timeout");
  }

  const mensajes = body.whatsapp_context?.messages || [];
  const ultimo = [...mensajes].reverse().find((m) => m.direction === "inbound");
  const id = ultimo?.reply_option_id || null;

  if (id) {
    const [prefijo, valor = ""] = id.split(/_(.*)/s);
    const vars = {};

    // Empezar a recomendar o elegir otra categoría borra lo anterior: una
    // alarma no tiene "adentro/afuera" ni batería.
    if (id === "m_recomendar") Object.assign(vars, { rec_cat: "", rec_loc: "", rec_pow: "", rec_bud: "" });
    if (prefijo === "cat") Object.assign(vars, { rec_cat: valor, rec_loc: "", rec_pow: "" });
    if (prefijo === "loc") vars.rec_loc = valor;
    if (prefijo === "pow") vars.rec_pow = valor;
    if (prefijo === "bud") vars.rec_bud = valor;

    if (tiene(id)) return responder(id, vars);
    if (tiene(prefijo)) return responder(prefijo, vars);
  }

  const texto = norm(ultimo?.content);
  if (/\b(persona|humano|asesor|operador|alguien|atencion)\b/.test(texto) && tiene("m_humano")) {
    return responder("m_humano");
  }
  if (/^(menu|inicio|volver|hola)\b/.test(texto) && tiene("menu")) {
    return responder("menu");
  }

  return responder(tiene("otro") ? "otro" : edges[0]);
}
