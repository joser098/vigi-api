// Atención por WhatsApp de VIGI.
//
// No vende ni es un agente de IA: al cliente siempre se le dan opciones
// (botones o listas). Sirve para dar confianza y responder dudas; la compra se
// hace siempre en la web, y cada respuesta lleva hacia allá.
//
// Los textos salen de vigi-app: preguntas frecuentes (services/const.ts),
// "Formas de entrega" y /legales/devoluciones. Si cambia una política allá,
// cambia acá.
//
// Cada pregunta es: mensaje con opciones → esperar respuesta → decide con
// vigi-ruteo. Si el cliente escribe en vez de tocar, se le vuelven a mostrar
// las opciones; si no contesta en ESPERA, la charla termina sin mensaje.

import { START, Workflow } from "@kapso/workflows";

// +54 9 11 2603-9243
const PHONE_NUMBER_ID = "990310140831998";
const TIENDA = "https://www.vigi.com.ar";
const ESPERA = 6 * 60 * 60;

const workflow = new Workflow("vigi-atencion", {
  name: "VIGI · Atención",
  status: "active",
});

workflow.addTrigger({ type: "inbound_message", phoneNumberId: PHONE_NUMBER_ID });

// Kapso rechaza una condición de decide sin descripción ("can't be blank").
const condicion = (label) => ({ label, description: `La función de ruteo devolvió "${label}"` });

// Posiciones del editor: una fila por pregunta, para que se lea en el panel.
let fila = 0;
const pos = (col, row = fila) => ({ position: { x: 120 + col * 320, y: 100 + row * 220 } });

const texto = (id, message, col, row) =>
  workflow.addNode(id, { type: "send_text", phoneNumberId: PHONE_NUMBER_ID, message }, pos(col, row));

/**
 * Mensaje con opciones + espera + ruteo.
 * `rutas` es { etiqueta: nodo destino }. "otro" y "timeout" se agregan solos.
 */
const pregunta = (id, mensaje, rutas) => {
  fila += 1;
  workflow.addNode(id, { type: "send_interactive", phoneNumberId: PHONE_NUMBER_ID, ...mensaje }, pos(0));
  workflow.addNode(`${id}_esperar`, { type: "wait_for_response", timeoutSeconds: ESPERA }, pos(1));
  workflow.addNode(
    `${id}_ruta`,
    {
      type: "decide",
      decisionType: "function",
      functionSlug: "vigi-ruteo",
      conditions: [...Object.keys(rutas), "otro", "timeout"].map(condicion),
    },
    pos(2)
  );
  texto(`${id}_otro`, "Para ayudarte mejor, elegí una de las opciones 👇", 3);

  workflow.addEdge(id, `${id}_esperar`);
  workflow.addEdge(`${id}_esperar`, `${id}_ruta`);
  for (const [label, destino] of Object.entries(rutas)) {
    workflow.addEdge(`${id}_ruta`, destino, { label });
  }
  workflow.addEdge(`${id}_ruta`, `${id}_otro`, { label: "otro" });
  workflow.addEdge(`${id}_otro`, id);
  workflow.addEdge(`${id}_ruta`, "fin", { label: "timeout" });
};

// Opciones del menú principal que también se pueden tocar desde otros lados.
const SECCIONES = {
  m_acordar: "acordar",
  m_recomendar: "rec_cat",
  m_envios: "envios",
  m_pagos: "pagos",
  m_garantia: "garantia",
  m_pedido: "pedido",
  m_humano: "humano",
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

workflow.addNode(START, pos(0, 0));
workflow.addNode(
  "entrada",
  {
    type: "decide",
    decisionType: "function",
    functionSlug: "vigi-entrada",
    conditions: ["menu", "producto", "acordar_directo", ...Object.keys(SECCIONES)].map(condicion),
  },
  pos(1, 0)
);
workflow.addEdge(START, "entrada");
workflow.addEdge("entrada", "menu", { label: "menu" });
// Link del mail de compra: ya trae el número de pedido.
workflow.addEdge("entrada", "acordar_ruta", { label: "acordar_directo" });
workflow.addEdge("entrada", "producto", { label: "producto" });
for (const [label, destino] of Object.entries(SECCIONES)) {
  workflow.addEdge("entrada", destino, { label });
}

// Final silencioso: el cliente dejó de contestar.
workflow.addNode("fin", { type: "set_variable", variableName: "cerrado", variableValue: true, valueType: "boolean" }, pos(4, 0));

// ---------------------------------------------------------------------------
// Menú principal
// ---------------------------------------------------------------------------

pregunta(
  "menu",
  {
    interactiveType: "list",
    bodyText:
      "¡Hola! 👋 Somos *VIGI*, tienda online de cámaras y seguridad para tu casa o negocio.\n\n¿En qué te ayudamos?",
    footerText: "Las compras se hacen en vigi.com.ar",
    listButtonText: "Ver opciones",
    listSections: [
      {
        title: "Elegí una opción",
        rows: [
          { id: "m_acordar", title: "Acordar envío de compra", description: "Compraste con \"acordar el envío\": coordinamos la entrega" },
          { id: "m_recomendar", title: "Ayuda para elegir", description: "Te recomendamos productos según lo que necesitás" },
          { id: "m_envios", title: "Envíos y entregas", description: "Plazos y costos de envío a todo el país" },
          { id: "m_pagos", title: "Medios de pago" },
          { id: "m_garantia", title: "Garantía y devoluciones" },
          { id: "m_pedido", title: "Mi pedido", description: "Estado, cambios o cancelación" },
          { id: "m_humano", title: "Hablar con una persona" },
        ],
      },
    ],
  },
  SECCIONES
);

// ---------------------------------------------------------------------------
// Consulta desde la ficha de un producto de la web
// ---------------------------------------------------------------------------

pregunta(
  "producto",
  {
    interactiveType: "button",
    bodyText:
      "¡Hola! 👋 Gracias por escribirnos por *{{vars.producto_titulo}}* ({{vars.producto_precio}}).\n\n" +
      "Lo podés ver y comprar acá: {{vars.producto_url}}\n\n¿En qué te ayudamos?",
    buttons: [
      { id: "m_humano", title: "Tengo una pregunta" },
      { id: "m_envios", title: "Envíos y entregas" },
      { id: "menu", title: "Ver más opciones" },
    ],
  },
  { m_humano: "humano", m_envios: "envios", menu: "menu" }
);

// ---------------------------------------------------------------------------
// Respuestas fijas
// ---------------------------------------------------------------------------

fila += 1;
const filaTextos = fila;

texto(
  "envios",
  "🚚 *Envíos y entregas*\n\n" +
    "• *CABA*: te llega en 24 h hábiles, sin costo.\n" +
    "• *Resto del AMBA*: en un máximo de 4 días hábiles.\n" +
    "• *Resto del país*: de 8 a 12 días hábiles, por Correo Argentino, a domicilio o para retirar en sucursal. El retiro en sucursal es gratis desde $450.000; el resto se cotiza según tu código postal y ves el costo antes de pagar.\n" +
    "• *Acordar el envío*: pagás solo los productos y te lo llevamos sin cargo a un punto de CABA que te sirva (por ejemplo, un expreso). Después de comprar, escribinos acá y elegí \"Acordar envío de compra\".\n\n" +
    "Si el pago se aprueba antes de las 17:00, despachamos ese mismo día. No tenemos envío express.\n\n" +
    `Más info: ${TIENDA}/legales/envios`,
  0,
  filaTextos
);

texto(
  "pagos",
  "💳 *Medios de pago*\n\n" +
    "Aceptamos tarjetas de crédito (Visa, Mastercard, American Express) y de débito.\n\n" +
    "El pago se hace en la web al finalizar la compra: en el carrito elegís uno de los dos procesadores y completás el pago en su pantalla, de forma segura.\n\n" +
    `👉 ${TIENDA}`,
  1,
  filaTextos
);

texto(
  "garantia",
  "🛡️ *Garantía y devoluciones*\n\n" +
    "Todos nuestros productos son nuevos y tienen garantía.\n\n" +
    "• *Si llegó fallado o dañado*: avisanos dentro de los 5 días corridos de recibirlo y te lo cambiamos o te devolvemos el dinero, a tu elección. Tiene que conservar sus accesorios originales.\n" +
    "• *Después de esos 5 días*: rige la garantía del fabricante, de 6 meses a 2 años según la marca, y te ayudamos a gestionarla.\n\n" +
    "Para iniciar un caso, escribinos a contacto@vigi.com.ar con el asunto \"Producto defectuoso\", fotos o video del problema y tu número de pedido.\n\n" +
    `Política completa: ${TIENDA}/legales/devoluciones`,
  2,
  filaTextos
);

texto(
  "pedido",
  "📦 *Tu pedido*\n\n" +
    "Cuando despachamos tu pedido te llega un mail. Para ver el estado, entrá a tu cuenta en la web, en la sección \"Pedidos\":\n" +
    `${TIENDA}/profile\n\n` +
    "Si necesitás modificarlo o cancelarlo, hablá con nosotros lo antes posible: una vez despachado, puede que no podamos hacer cambios.",
  3,
  filaTextos
);

for (const id of ["envios", "pagos", "garantia", "pedido"]) workflow.addEdge(id, "despues");

// Después de cada respuesta fija.
pregunta(
  "despues",
  {
    interactiveType: "button",
    bodyText: "¿Te ayudamos con algo más?",
    buttons: [
      { id: "menu", title: "Menú principal" },
      { id: "m_humano", title: "Hablar con alguien" },
      { id: "fin_gracias", title: "Listo, gracias" },
    ],
  },
  { menu: "menu", m_humano: "humano", fin_gracias: "gracias" }
);

texto("gracias", "¡Gracias por escribirnos! 🙌 Cuando quieras, estamos por acá.", 4);

// ---------------------------------------------------------------------------
// Acordar envío de mi compra
//
// El cliente eligió "acordar el envío" en el checkout. Se le pide el número
// de pedido, vigi-acordar lo valida contra la API y, si corresponde, la charla
// pasa a una persona que coordina punto, día y horario. Desde el link del mail
// de compra se entra directo a la validación, con el número ya en el mensaje.
// ---------------------------------------------------------------------------

fila += 1;
texto(
  "acordar",
  "📦 *Acordar el envío*\n\n" +
    "Mandanos tu *número de pedido*. Lo encontrás en el mail de confirmación de compra y en tu cuenta de la web, en \"Pedidos\".",
  0
);
workflow.addNode("acordar_esperar", { type: "wait_for_response", timeoutSeconds: ESPERA }, pos(1));
workflow.addNode(
  "acordar_ruta",
  {
    type: "decide",
    decisionType: "function",
    functionSlug: "vigi-acordar",
    conditions: ["ok", "no_es_acordar", "no_encontrado", "timeout"].map(condicion),
  },
  pos(2)
);
workflow.addEdge("acordar", "acordar_esperar");
workflow.addEdge("acordar_esperar", "acordar_ruta");
workflow.addEdge("acordar_ruta", "fin", { label: "timeout" });

fila += 1;
texto(
  "acordar_ok",
  "¡Listo! ✅ Encontramos tu pedido *{{vars.pedido_acordar}}*.\n\n" +
    "Te pasamos con una persona del equipo para coordinar el punto, el día y el horario de entrega en CABA. " +
    "Si ya sabés a qué expreso, transporte o dirección querés que lo llevemos, contanos acá.\n\n" +
    `Condiciones: ${TIENDA}/legales/envios#acordar`,
  0
);
workflow.addNode("acordar_handoff", { type: "handoff", reason: "acordar_envio" }, pos(1));
workflow.addEdge("acordar_ruta", "acordar_ok", { label: "ok" });
workflow.addEdge("acordar_ok", "acordar_handoff");

texto(
  "acordar_no_es",
  "El pedido *{{vars.pedido_acordar}}* no tiene el envío a acordar: va por Correo Argentino, como elegiste al comprar. " +
    "Estado: *{{vars.pedido_estado}}*.\n\n" +
    `Podés seguirlo desde tu cuenta: ${TIENDA}/profile`,
  2
);
workflow.addEdge("acordar_ruta", "acordar_no_es", { label: "no_es_acordar" });
workflow.addEdge("acordar_no_es", "despues");

workflow.addEdge("acordar_ruta", "acordar_reintentar", { label: "no_encontrado" });
pregunta(
  "acordar_reintentar",
  {
    interactiveType: "button",
    bodyText:
      "No encontramos ese número de pedido. 🤔 Revisalo en el mail de confirmación de compra: es el que dice \"Número de orden\".",
    buttons: [
      { id: "m_acordar", title: "Probar de nuevo" },
      { id: "m_humano", title: "Hablar con alguien" },
      { id: "menu", title: "Menú principal" },
    ],
  },
  { m_acordar: "acordar", m_humano: "humano", menu: "menu" }
);

// ---------------------------------------------------------------------------
// Hablar con una persona
// ---------------------------------------------------------------------------

fila += 1;
texto(
  "humano",
  "Listo, te pasamos con una persona del equipo. 🙌\n\nContanos tu consulta y te respondemos por acá lo antes posible.",
  0
);
workflow.addNode("handoff", { type: "handoff", reason: "pidio_persona" }, pos(1));
workflow.addEdge("humano", "handoff");

// ---------------------------------------------------------------------------
// Ayuda para elegir: las mismas preguntas que el asistente del home
// ---------------------------------------------------------------------------

pregunta(
  "rec_cat",
  {
    interactiveType: "list",
    bodyText: "Te ayudamos a elegir. ¿Qué estás buscando?",
    listButtonText: "Elegir",
    listSections: [
      {
        rows: [
          { id: "cat_camaras", title: "Cámaras" },
          { id: "cat_kits", title: "Kit de cámaras", description: "Grabador + cámaras, todo junto" },
          { id: "cat_alarmas", title: "Una alarma" },
          { id: "cat_porteros", title: "Portero eléctrico" },
          { id: "cat_cerraduras", title: "Cerradura inteligente" },
          { id: "menu", title: "Volver al menú" },
        ],
      },
    ],
  },
  // Solo las cámaras preguntan dónde van y cómo se alimentan.
  { cat_camaras: "rec_loc", cat: "rec_bud", menu: "menu" }
);

pregunta(
  "rec_loc",
  {
    interactiveType: "button",
    bodyText: "¿Dónde la vas a poner?",
    buttons: [
      { id: "loc_interior", title: "Adentro" },
      { id: "loc_exterior", title: "Afuera" },
      { id: "loc_ambas", title: "En los dos lados" },
    ],
  },
  { loc: "rec_pow" }
);

pregunta(
  "rec_pow",
  {
    interactiveType: "button",
    bodyText: "¿Tenés un enchufe cerca?",
    buttons: [
      { id: "pow_enchufe", title: "Sí, hay enchufe" },
      { id: "pow_bateria", title: "No, mejor batería" },
    ],
  },
  { pow: "rec_bud" }
);

pregunta(
  "rec_bud",
  {
    interactiveType: "list",
    bodyText: "¿Cuánto querés gastar?",
    listButtonText: "Elegir",
    listSections: [
      {
        rows: [
          { id: "bud_60000", title: "Hasta $60.000" },
          { id: "bud_120000", title: "Hasta $120.000" },
          { id: "bud_250000", title: "Hasta $250.000" },
          { id: "bud_0", title: "Sin límite" },
        ],
      },
    ],
  },
  { bud: "recomendar" }
);

fila += 1;
workflow.addNode("recomendar", { type: "function", functionSlug: "vigi-recomendar" }, pos(0));
texto("recomendacion", "{{vars.recomendacion}}", 1);
workflow.addEdge("recomendar", "recomendacion");
workflow.addEdge("recomendacion", "rec_despues");

pregunta(
  "rec_despues",
  {
    interactiveType: "button",
    bodyText: "¿Qué hacemos ahora?",
    buttons: [
      { id: "m_recomendar", title: "Buscar otra cosa" },
      { id: "m_humano", title: "Hablar con alguien" },
      { id: "menu", title: "Menú principal" },
    ],
  },
  { m_recomendar: "rec_cat", m_humano: "humano", menu: "menu" }
);

export default workflow;
