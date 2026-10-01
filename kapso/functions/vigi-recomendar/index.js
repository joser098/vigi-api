// Recomendador del workflow vigi-atencion.
//
// Es el mismo asistente del home de la web ("Encontrá la tuya en 30
// segundos"), con las mismas preguntas y el mismo endpoint: /search/recommend.
// Las respuestas las deja vigi-ruteo en vars (rec_cat, rec_loc, rec_pow,
// rec_bud) y acá se arma un solo mensaje con los productos y su link.
//
// No vende: cada producto lleva a su ficha en la web, que es donde se compra.

const API = "https://vigi-api-production-31a2.up.railway.app/api";
const TIENDA = "https://www.vigi.com.ar";
const CUANTOS = 4;

const pesos = (n) => "$" + Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const responder = (vars) =>
  new Response(JSON.stringify({ vars }), { headers: { "Content-Type": "application/json" } });

async function handler(request, env) {
  const body = await request.json();
  const v = body.execution_context?.vars || {};

  const q = new URLSearchParams({ limit: String(CUANTOS) });
  if (v.rec_cat) q.set("category", v.rec_cat);
  // "ambas" significa que la ubicación no importa: no se manda.
  if (v.rec_loc && v.rec_loc !== "ambas") q.set("location", v.rec_loc);
  if (v.rec_pow) q.set("power", v.rec_pow);
  if (v.rec_bud && v.rec_bud !== "0") q.set("budget", v.rec_bud);

  const verTodo = `${TIENDA}/category/${encodeURIComponent(v.rec_cat || "camaras")}`;

  let data;
  try {
    const r = await fetch(`${API}/search/recommend?${q}`);
    data = (await r.json())?.data;
  } catch {
    data = null;
  }

  if (!data) {
    return responder({
      recomendacion:
        `No pude buscar los productos en este momento 😕\n\nPodés verlos todos en la web: ${verTodo}`,
    });
  }

  const items = data.items || [];
  if (!items.length) {
    return responder({
      recomendacion:
        "No encontré productos con todo eso junto 🤔\n\n" +
        "Probá con otro presupuesto, o mirá todas las opciones de la categoría en la web: " +
        verTodo,
    });
  }

  const lineas = items.map((p) => {
    const precio = p.discount > 0 && p.price_original
      ? `${pesos(p.price)} (antes ${pesos(p.price_original)})`
      : pesos(p.price);
    return `*${p.title || p.model}*\n${precio}\n${TIENDA}/product/${encodeURIComponent(p.model)}`;
  });

  const total = Number(data.total) || items.length;
  const mas = total > items.length
    ? `\n\nHay ${total} opciones en total. Mirá todas en la web: ${verTodo}`
    : "";

  return responder({
    recomendacion:
      `Estas son las que mejor encajan con lo que buscás 👇\n\n${lineas.join("\n\n")}${mas}\n\n` +
      "La compra se hace en la web, con envío a todo el país.",
  });
}
