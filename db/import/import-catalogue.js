#!/usr/bin/env node
//
// Importa la lista de precios del proveedor al catálogo.
//
//   node db/import/import-catalogue.js            # simulacro, no escribe nada
//   node db/import/import-catalogue.js --apply    # escribe
//   node db/import/import-catalogue.js --apply --only=EZVIZ
//
// Qué toca y qué no, al reimportar un producto que ya existe:
//
//   ACTUALIZA   cost (y con eso price, vía trigger), title, description,
//               details, tags, category, facets
//   NO TOCA     price_override, margin_pct, discount, has_promotion, thumbnail,
//               is_active
//
// O sea: la lista del proveedor manda sobre el costo y la ficha, pero nunca
// pisa una decisión comercial tomada a mano.

require("dotenv").config();
const { query, withTransaction, closeConnection } = require("../../src/db/client");
const { PROVIDERS, SECTIONS, TAB_DEFAULTS, SKIP_TABS } = require("./catalogue-map");

const SHEET_ID = "1iu-qsCOJ9FsHdajPlHr06FjFyfwsotRfRX2dtGFWit8";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];

// ---------------------------------------------------------------------------
// Lectura del sheet
// ---------------------------------------------------------------------------

const fetchTab = async (name) => {
  const url =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq` +
    `?tqx=out:json&sheet=${encodeURIComponent(name)}`;

  const text = await fetch(url).then((r) => r.text());

  if (!text.includes("google.visualization")) {
    throw new Error(`La pestaña "${name}" no devolvió datos. ¿Sigue existiendo y compartida por link?`);
  }

  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));

  return json.table.rows || [];
};

// ---------------------------------------------------------------------------
// Parseo
// ---------------------------------------------------------------------------

const slug = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// La descripción viene con las specs separadas por "|". Se guarda la lista
// completa en details.specs y, además, se extraen algunas claves conocidas
// para que la ficha técnica del front tenga con qué trabajar.
const parseDetails = (description) => {
  const specs = String(description)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const details = { specs };
  const buscar = (re) => specs.map((s) => s.match(re)).find(Boolean);

  const resolucion = buscar(/^(\d+(?:\.\d+)?\s*(?:MP|K\+?|P))\b/i);
  if (resolucion) details.resolution = resolucion[1];

  const lente = buscar(/lente\s+(.+)/i);
  if (lente) details.lens = lente[1];

  const ir = buscar(/\bIR\s+(\d+\s*m)/i);
  if (ir) {
    details.night_vision = true;
    details.night_range_distance = ir[1];
  }

  if (specs.some((s) => /audio/i.test(s))) details.audio = true;
  if (specs.some((s) => /wi-?fi/i.test(s))) details.conectivity = "Wi-Fi";
  if (specs.some((s) => /\bPoE\b/i.test(s))) details.conectivity = "PoE";

  return details;
};

// El proveedor pone "Exterior" o "Interior" como primera spec en casi todas
// las cámaras. Es la fuente más completa para el facet.
const locationFromText = (text) => {
  const t = String(text).toLowerCase();
  const ext = /\bexterior\b/.test(t);
  const int = /\binterior\b/.test(t);

  if (ext && !int) return "exterior";
  if (int && !ext) return "interior";

  return null;
};

// Tags que salen del texto, además de los de la sección.
const tagsFromText = (text) => {
  const t = String(text).toLowerCase();
  const found = [];

  if (/wi-?fi/.test(t)) found.push("wifi");
  if (/\b4g\b/.test(t)) found.push("4g");
  if (/bater[ií]a/.test(t)) found.push("bateria");
  if (/solar/.test(t)) found.push("solar");
  if (/\bptz\b/.test(t)) found.push("ptz");
  if (/\bpoe\b/.test(t)) found.push("poe");
  if (/exterior/.test(t)) found.push("exterior");
  if (/interior/.test(t)) found.push("interior");

  return found;
};

// Solo para filas que aparecen antes de la primera sección. La descripción del
// proveedor es bastante consistente: "32CH | 1080P" es un grabador, "Bullet |
// Lente 2.8mm" es una cámara, "SSD 120GB" es almacenamiento. Es más confiable
// que asumir la categoría por la pestaña.
const guessCategory = (model, description) => {
  const t = `${model} ${description ?? ""}`.toLowerCase();

  if (/^kit/.test(String(model).toLowerCase())) return { category: "kits", tags: ["kit"] };
  if (/\b\d+\s*ch\b/.test(t) || /decodificaci/.test(t) || /\b(nvr|xvr|dvr)\b/.test(t))
    return { category: "grabadores", tags: [] };
  if (/\b(bullet|domo|varifocal|ptz|fisheye)\b/.test(t) || /lente\s/.test(t) || /\bir\s*\d+\s*m/.test(t))
    return { category: "camaras", tags: [] };
  if (/\b(ssd|hdd|disco|microsd|pendrive|memoria)\b/.test(t))
    return { category: "almacenamiento", tags: [] };
  if (/\b(router|switch|access\s*point|repetidor|mesh)\b/.test(t))
    return { category: "redes", tags: [] };

  return null;
};

const parseTab = (tabName, rows, problemas) => {
  const provider = PROVIDERS[tabName] ?? "Varios";
  const productos = [];
  let seccion = null;

  for (const row of rows) {
    const c = row.c || [];
    const model = c[1]?.v;
    const description = c[2]?.v;
    const cost = c[3]?.v;
    const badge = c[4]?.v;

    // Fila de sección: texto en C, sin modelo ni precio.
    if (!model && cost == null && description) {
      seccion = String(description).trim();
      continue;
    }

    if (!model || cost == null) continue;

    const costNum = Number(cost);
    if (!Number.isFinite(costNum) || costNum <= 0) continue;

    // Sin sección todavía: se usa el default de la pestaña y se marca, porque
    // la categoría es una suposición.
    const porSeccion = seccion ? SECTIONS[seccion] : null;
    const adivinada = porSeccion ? null : guessCategory(model, description);
    const mapping = porSeccion ?? adivinada ?? TAB_DEFAULTS[tabName];
    const esFallback = !porSeccion;

    if (!mapping) {
      problemas.push(
        `${tabName}: sección sin mapear -> "${seccion ?? "(sin sección)"}"`
      );
      continue;
    }

    const texto = `${model} ${description ?? ""}`;
    const tags = [
      ...new Set([
        // La categoría entra como tag para que sea buscable: el proveedor
        // escribe "Bullet" o "Domo", nunca "cámara", y es lo primero que
        // escribe un cliente en el buscador.
        mapping.category,
        ...(mapping.tags || []),
        ...tagsFromText(texto),
        ...(badge ? [slug(badge)] : []),
      ]),
    ];

    productos.push({
      model: String(model).trim(),
      title: `${provider} ${String(model).trim()}`,
      description: description ? String(description).trim() : null,
      cost: costNum,
      provider,
      category: mapping.category,
      // La sección manda, pero casi todas las descripciones dicen
      // "Exterior"/"Interior" y la sección no. Sin esto los facets quedan
      // prácticamente vacíos.
      location: mapping.location ?? locationFromText(texto),
      power_type: mapping.power_type ?? (tags.includes("bateria") ? "bateria" : null),
      is_analogue: mapping.analogue ?? false,
      tags,
      details: parseDetails(description ?? ""),
      _fallback: esFallback,
      _tab: tabName,
    });
  }

  return productos;
};

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

const upsert = (client, p) =>
  client.query(
    `insert into products
       (model, title, description, cost, provider, category,
        location, power_type, is_analogue, tags, details, price)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0)
     on conflict (model) do update set
       title       = excluded.title,
       description = excluded.description,
       cost        = excluded.cost,
       provider    = excluded.provider,
       category    = excluded.category,
       location    = excluded.location,
       power_type  = excluded.power_type,
       is_analogue = excluded.is_analogue,
       tags        = excluded.tags,
       details     = products.details || excluded.details
     returning (xmax = 0) as insertado`,
    [
      p.model, p.title, p.description, p.cost, p.provider, p.category,
      p.location, p.power_type, p.is_analogue, p.tags, JSON.stringify(p.details),
    ]
  );

// ---------------------------------------------------------------------------

(async () => {
  const tabs = ONLY ? [ONLY] : Object.keys(PROVIDERS);
  const problemas = [];
  const todos = [];

  console.log(APPLY ? "MODO ESCRITURA\n" : "SIMULACRO — no se escribe nada. Usá --apply para aplicar.\n");

  for (const tab of tabs) {
    if (SKIP_TABS[tab]) {
      console.log(`  ${tab.padEnd(28)}    - omitida: ${SKIP_TABS[tab].split(",")[0]}`);
      continue;
    }

    try {
      const rows = await fetchTab(tab);
      const productos = parseTab(tab, rows, problemas);
      todos.push(...productos);
      console.log(`  ${tab.padEnd(28)} ${String(productos.length).padStart(4)} productos`);
    } catch (e) {
      problemas.push(`${tab}: ${e.message}`);
    }
  }

  // Un modelo repetido entre pestañas rompería el upsert contra sí mismo.
  // Se queda el de menor costo: si el proveedor lo lista dos veces, el barato
  // es el que conviene.
  const porModelo = new Map();
  const duplicados = new Set();
  for (const p of todos) {
    const previo = porModelo.get(p.model);
    if (!previo) { porModelo.set(p.model, p); continue; }

    duplicados.add(p.model);
    if (p.cost < previo.cost) porModelo.set(p.model, p);
  }

  console.log(`\n  total: ${todos.length} filas | ${porModelo.size} modelos únicos`);
  if (duplicados.size) {
    console.log(`  ${duplicados.size} modelos repetidos entre pestañas (se queda el de menor costo)`);
  }

  const fallbacks = [...porModelo.values()].filter((p) => p._fallback);
  if (fallbacks.length) {
    console.log(`\n  ${fallbacks.length} productos sin sección — categoría supuesta por pestaña, REVISAR:`);
    fallbacks.slice(0, 15).forEach((p) =>
      console.log(`    ${p._tab.padEnd(22)} ${p.model.padEnd(18)} -> ${p.category}`)
    );
    if (fallbacks.length > 15) console.log(`    … y ${fallbacks.length - 15} más`);
  }

  if (problemas.length) {
    console.log("\nPROBLEMAS:");
    [...new Set(problemas)].forEach((p) => console.log("  - " + p));
    console.log("\nAgregá las secciones faltantes a db/import/catalogue-map.js y volvé a correr.");
  }

  // Resumen de categorías, para revisar el mapeo antes de escribir.
  const porCategoria = {};
  for (const p of porModelo.values()) porCategoria[p.category] = (porCategoria[p.category] || 0) + 1;
  console.log("\n  por categoría:", Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" "));

  if (!APPLY) {
    const muestra = [...porModelo.values()].slice(0, 3);
    console.log("\n  muestra:");
    muestra.forEach((p) =>
      console.log(`    ${p.model} | ${p.provider} | ${p.category} | costo ${p.cost} -> precio ${Math.round(p.cost * 1.3)} | tags: ${p.tags.join(",")}`)
    );
    await closeConnection();
    return;
  }

  let nuevos = 0, actualizados = 0;

  await withTransaction(async (client) => {
    for (const p of porModelo.values()) {
      const r = await upsert(client, p);
      if (r.rows[0].insertado) nuevos++;
      else actualizados++;
    }
  });

  console.log(`\n  nuevos: ${nuevos} | actualizados: ${actualizados}`);
  await closeConnection();
})().catch(async (e) => {
  console.error("ERROR:", e.message);
  await closeConnection();
  process.exit(1);
});
