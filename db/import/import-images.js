#!/usr/bin/env node
//
// Extrae las fotos de producto del sheet del proveedor y las sube a R2.
//
//   node db/import/import-images.js --xlsx=ruta.xlsx                 # simulacro
//   node db/import/import-images.js --xlsx=ruta.xlsx --apply
//   node db/import/import-images.js --xlsx=ruta.xlsx --apply --only=EZVIZ
//
// Cómo se sabe qué imagen es de qué producto: en un XLSX las imágenes flotantes
// no viven en las celdas, se anclan a una fila desde xl/drawings/drawingN.xml.
// La cadena es
//
//   hoja -> drawing -> anchor(fila) -> rId -> xl/media/imagenN.png
//
// y por otro lado la fila de la hoja tiene el modelo en la columna B. Uniendo
// las dos por número de fila sale el par modelo/imagen.
//
// El XLSX se descarga de:
//   https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx
// Pesa bastante (~160 MB), así que conviene bajarlo aparte y pasarlo con --xlsx.

require("dotenv").config();
const fs = require("node:fs");
const JSZip = require("jszip");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { query, closeConnection } = require("../../src/db/client");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const XLSX = args.find((a) => a.startsWith("--xlsx="))?.split("=")[1];

// Orden de prioridad: primero las marcas que más se venden. Una corrida sin
// --only recorre todas; las que ya tienen foto se saltean.
const HOJAS = [
  "EZVIZ", "IMOU", "Hikvision Cctv-IP", "DAHUA",
  "Hilook", "Hik Alarma/Portero/Acceso", "Tp-Link", "Intelbras",
  "Accesorios / Varios", "Commax", "hoja", "KITS",
];

// Google renombra las hojas al exportar: le saca los caracteres que no valen
// en un nombre de hoja de Excel y a veces deja un espacio al final
// ("Accesorios / Varios" queda como "Accesorios  Varios ").
const normalizarNombre = (n) => n.replace(/[\/\\?*\[\]]/g, "").trim();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Las rutas tienen que coincidir exactamente con lo que pide el frontend.
// Gallery.astro arma la URL así:
//
//   `${BASE}/gallery/${encodeURIComponent(model).replace(/%20/g,"+")}/${i}.png`
//
// De ahí salen dos formas del modelo:
//
//   clave en R2  espacios -> "+", la barra queda como barra real (carpeta)
//   en la URL    encodeURIComponent, con %20 pasado a "+"
//
// Verificado contra el bucket: pedir .../NVR-104H-D%2F4P/0.png resuelve a la
// clave gallery/NVR-104H-D/4P/0.png, y un JPEG bajo clave .png se sirve bien
// mientras el Content-Type sea el correcto.
const keyModel = (m) => String(m).replace(/ /g, "+");
const urlModel = (m) => encodeURIComponent(String(m)).replace(/%20/g, "+");

const leer = (zip, ruta) => (zip.file(ruta) ? zip.file(ruta).async("string") : Promise.resolve(null));

// --- Mapa hoja -> { sheetXml, drawingXml, drawingRels } ---------------------

const mapearHojas = async (zip) => {
  const wb = await leer(zip, "xl/workbook.xml");
  const rels = await leer(zip, "xl/_rels/workbook.xml.rels");

  const relMap = {};
  [...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].forEach((m) => { relMap[m[1]] = m[2]; });

  const hojas = {};
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const nombre = m[1];
    const sheetFile = "xl/" + relMap[m[2]].replace(/^\/?xl\//, "");
    const relsFile = sheetFile.replace(/worksheets\/(sheet\d+)\.xml/, "worksheets/_rels/$1.xml.rels");

    let drawing = null;
    const r = await leer(zip, relsFile);
    if (r) {
      const d = r.match(/Target="([^"]*drawing\d+\.xml)"/);
      if (d) drawing = "xl/drawings/" + d[1].split("/").pop();
    }

    hojas[nombre] = { sheetFile, drawing };
  }

  return hojas;
};

// --- Fila -> modelo (columna B) ---------------------------------------------

const modelosPorFila = async (zip, sheetFile, shared) => {
  const xml = await leer(zip, sheetFile);
  const filas = {};

  for (const m of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila = Number(m[1]);
    const celdaB = m[2].match(/<c r="B\d+"(?: s="\d+")?(?: t="([^"]+)")?[^>]*>([\s\S]*?)<\/c>/);
    if (!celdaB) continue;

    const tipo = celdaB[1];
    const v = celdaB[2].match(/<v>([\s\S]*?)<\/v>/);
    const inline = celdaB[2].match(/<t[^>]*>([\s\S]*?)<\/t>/);

    let valor = null;
    if (tipo === "s" && v) valor = shared[Number(v[1])];
    else if (inline) valor = inline[1];
    else if (v) valor = v[1];

    if (valor && valor.trim()) filas[fila] = valor.trim();
  }

  return filas;
};

// --- Fila -> imagen ---------------------------------------------------------

const imagenesPorFila = async (zip, drawingFile) => {
  if (!drawingFile) return {};

  const xml = await leer(zip, drawingFile);
  const relsFile = drawingFile.replace(/drawings\/(drawing\d+)\.xml/, "drawings/_rels/$1.xml.rels");
  const rels = await leer(zip, relsFile);
  if (!rels) return {};

  const relMap = {};
  [...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].forEach((m) => {
    relMap[m[1]] = "xl/media/" + m[2].split("/").pop();
  });

  const porFila = {};
  // Los anchors pueden ser oneCell o twoCell; los dos abren con <xdr:from>.
  for (const m of xml.matchAll(/<xdr:(?:one|two)CellAnchor[\s\S]*?<\/xdr:(?:one|two)CellAnchor>/g)) {
    const bloque = m[0];
    const fila = bloque.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    const embed = bloque.match(/r:embed="([^"]+)"/);
    if (!fila || !embed) continue;

    // xdr:row es base 0; las filas de la hoja son base 1.
    const nroFila = Number(fila[1]) + 1;
    if (!porFila[nroFila] && relMap[embed[1]]) porFila[nroFila] = relMap[embed[1]];
  }

  return porFila;
};

// ---------------------------------------------------------------------------

(async () => {
  if (!XLSX || !fs.existsSync(XLSX)) {
    console.error("Falta --xlsx=<ruta al .xlsx>. Descargalo con:");
    console.error("  curl -L 'https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx' -o sheet.xlsx");
    process.exit(1);
  }

  console.log(APPLY ? "MODO ESCRITURA\n" : "SIMULACRO — no sube ni escribe nada. Usá --apply.\n");

  const zip = await JSZip.loadAsync(fs.readFileSync(XLSX));

  const ss = await leer(zip, "xl/sharedStrings.xml");
  const shared = ss
    ? [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
        [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
      )
    : [];

  const hojas = await mapearHojas(zip);
  const objetivo = ONLY ? [ONLY] : HOJAS;

  const pares = [];
  const sinImagen = [];

  for (const nombre of objetivo) {
    const clave = Object.keys(hojas).find(
      (h) => normalizarNombre(h) === normalizarNombre(nombre)
    );

    if (!clave) {
      console.log(`  ${nombre.padEnd(22)} no encontrada en el xlsx`);
      continue;
    }

    const { sheetFile, drawing } = hojas[clave];
    const modelos = await modelosPorFila(zip, sheetFile, shared);
    const imagenes = await imagenesPorFila(zip, drawing);

    let conFoto = 0;
    for (const [fila, modelo] of Object.entries(modelos)) {
      const img = imagenes[Number(fila)];
      if (img) { pares.push({ hoja: nombre, modelo, archivo: img }); conFoto++; }
      else sinImagen.push(`${nombre}: ${modelo}`);
    }

    console.log(
      `  ${nombre.padEnd(22)} ${String(Object.keys(modelos).length).padStart(4)} modelos · ` +
      `${String(Object.keys(imagenes).length).padStart(4)} imágenes · ${String(conFoto).padStart(4)} emparejadas`
    );
  }

  // Solo importan los modelos que existen en el catálogo.
  const enBase = new Map(
    (await query("select id, model, thumbnail from products")).rows.map((r) => [r.model.toUpperCase(), r])
  );

  const aSubir = [];
  const noEstan = [];
  for (const p of pares) {
    const row = enBase.get(p.modelo.toUpperCase());
    if (row) aSubir.push({ ...p, id: row.id, yaTiene: !!row.thumbnail });
    else noEstan.push(`${p.hoja}: ${p.modelo}`);
  }

  console.log("");
  console.log(`  emparejadas con el catálogo: ${aSubir.length}`);
  console.log(`  en el sheet pero no en la base: ${noEstan.length}`);
  console.log(`  sin imagen en el sheet: ${sinImagen.length}`);

  // Tamaños, para no subir fotos de varios MB sin saberlo.
  let total = 0, mayor = 0;
  for (const p of aSubir) {
    const size = (await zip.file(p.archivo).async("nodebuffer")).length;
    total += size;
    mayor = Math.max(mayor, size);
  }
  if (aSubir.length) {
    console.log(`  peso: ${(total / 1024 / 1024).toFixed(1)} MB en total · ` +
                `${Math.round(total / aSubir.length / 1024)} KB promedio · ` +
                `${Math.round(mayor / 1024)} KB la más grande`);
  }

  if (!APPLY) {
    console.log("\n  muestra de rutas:");
    aSubir.slice(0, 6).forEach((p) => {
      console.log(`    ${p.modelo}`);
      console.log(`      thumbnails/${keyModel(p.modelo)}.png`);
      console.log(`      gallery/${keyModel(p.modelo)}/0.png`);
    });
    await closeConnection();
    return;
  }

  // Re-correr solo sube lo que falta: son casi mil objetos por red y no tiene
  // sentido repetirlos. Con --force se vuelven a subir todos.
  const FORCE = args.includes("--force");
  const pendientes = FORCE ? aSubir : aSubir.filter((p) => !p.yaTiene);

  if (pendientes.length !== aSubir.length) {
    console.log(`\n  ya subidos: ${aSubir.length - pendientes.length} (se saltean; usá --force para rehacerlos)`);
  }

  const subirUno = async (p) => {
    const ext = p.archivo.split(".").pop().toLowerCase();
    const contentType = ext === "png" ? "image/png" : "image/jpeg";

    // Siempre .png en la clave aunque el original sea jpg: Gallery.astro pide
    // .png fijo. El navegador renderiza por Content-Type, no por extensión.
    const claves = [
      `thumbnails/${keyModel(p.modelo)}.png`,
      `gallery/${keyModel(p.modelo)}/0.png`,
    ];

    const body = await zip.file(p.archivo).async("nodebuffer");

    await Promise.all(
      claves.map((Key) =>
        s3.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key,
          Body: body,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000, immutable",
        }))
      )
    );

    // El sheet trae una sola foto por producto, así que la galería queda en 1.
    await query(
      "update products set thumbnail = $2, gallery = 1 where id = $1",
      [p.id, `${process.env.R2_PUBLIC_URL}/thumbnails/${urlModel(p.modelo)}.png`]
    );
  };

  let subidas = 0, fallos = 0;
  const CONCURRENCIA = 8;

  for (let i = 0; i < pendientes.length; i += CONCURRENCIA) {
    const lote = pendientes.slice(i, i + CONCURRENCIA);

    await Promise.all(lote.map(async (p) => {
      try { await subirUno(p); subidas++; }
      catch (e) { fallos++; console.log(`  FALLA ${p.modelo}: ${e.message.slice(0, 60)}`); }
    }));

    if ((i + CONCURRENCIA) % 80 < CONCURRENCIA) {
      console.log(`  ${Math.min(i + CONCURRENCIA, pendientes.length)}/${pendientes.length}…`);
    }
  }

  console.log(`\n  subidas: ${subidas} productos (${subidas * 2} objetos) | fallos: ${fallos}`);
  await closeConnection();
})().catch(async (e) => {
  console.error("ERROR:", e.message);
  await closeConnection();
  process.exit(1);
});
