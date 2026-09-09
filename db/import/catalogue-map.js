// Traducción de la lista del proveedor al catálogo de VIGI.
//
// Este archivo es el que hay que editar cuando el proveedor agrega o renombra
// una sección. El importador NO adivina: si aparece una sección que no está
// acá, corta y la reporta, en vez de meter productos en la categoría
// equivocada sin que nadie se entere.

// Pestaña del sheet -> marca. La pestaña es la fuente del provider.
const PROVIDERS = {
  "Hilook": "Hilook",
  "Hikvision Cctv-IP": "Hikvision",
  "Hik Alarma/Portero/Acceso": "Hikvision",
  "DAHUA": "Dahua",
  "EZVIZ": "Ezviz",
  "IMOU": "Imou",
  "Tp-Link": "TP-Link",
  "Intelbras": "Intelbras",
  "Accesorios / Varios": "Varios",
  "Commax": "Commax",
  "Liq/Outlet": "Varios",
  "hoja": "Varios",
  "KITS": "Varios",
};

// Sección del sheet -> categoría, facets y tags.
//
//   category    obligatoria, tiene que existir en la tabla categories
//   location    'interior' | 'exterior'
//   power_type  'bateria' | 'cableada'
//   analogue    true si es analógica (BNC), no IP
//   tags        se suman a los que se derivan de la descripción
const SECTIONS = {
  // --- Grabadores ---
  "DVR":                              { category: "grabadores", tags: ["dvr"] },
  "DVR 1080P":                        { category: "grabadores", tags: ["dvr"] },
  "NVR":                              { category: "grabadores", tags: ["nvr"] },
  "DVR + camaras 5MP 3K - 8MP 4K":    { category: "kits",       tags: ["dvr", "kit"] },
  "EASYLINK":                         { category: "grabadores", tags: ["nvr", "easylink"] },
  "NVR y CAMARAS IP":                 { category: "grabadores", tags: ["nvr"] },

  // --- Cámaras analógicas (BNC) ---
  "CAMARAS 1MP":                      { category: "camaras", analogue: true, tags: ["analogica"] },
  "CAMARAS 2MP":                      { category: "camaras", analogue: true, tags: ["analogica"] },
  "CAMARAS 5MP - 8MP":                { category: "camaras", analogue: true, tags: ["analogica"] },

  // --- Cámaras IP ---
  "CAMARAS IP 1080P":                 { category: "camaras", tags: ["ip"] },
  "CAMARAS IP 2MP":                   { category: "camaras", tags: ["ip"] },
  "CAMARAS IP 3MP Y 4MP":             { category: "camaras", tags: ["ip"] },
  "CAMARAS IP 4MP - 5MP - 8MP":       { category: "camaras", tags: ["ip"] },
  "CAMARAS IP WIFI INTERIOR":         { category: "camaras", location: "interior", tags: ["ip", "wifi"] },
  "CAMARAS  IP WIFI FIJA EXTERIOR":   { category: "camaras", location: "exterior", tags: ["ip", "wifi"] },
  "CAMARAS IP WIFI FIJAS":            { category: "camaras", tags: ["ip", "wifi"] },
  "WIFI":                             { category: "camaras", tags: ["ip", "wifi"] },
  "CAMARAS CON MOVIMIENTO":           { category: "camaras", tags: ["movimiento", "motorizada"] },
  "CAMARAS CON MOVIMIENTO EXTERIOR":  { category: "camaras", location: "exterior", tags: ["movimiento", "motorizada"] },
  "CAMARAS CON BATERIA":              { category: "camaras", power_type: "bateria", tags: ["bateria", "inalambrica"] },
  "CAMARAS 4G":                       { category: "camaras", tags: ["4g"] },
  "IP- 4G":                           { category: "camaras", tags: ["ip", "4g"] },
  "CAMARAS PTZ":                      { category: "camaras", tags: ["ptz", "motorizada"] },
  "CAMARAS PTZ / TERMICAS / SOLARES": { category: "camaras", tags: ["ptz", "motorizada"] },
  "TERMICAS":                         { category: "camaras", tags: ["termica"] },
  "SOLARES":                          { category: "camaras", power_type: "bateria", tags: ["solar", "bateria"] },
  "TP-LINK TAPO":                     { category: "camaras", tags: ["ip", "wifi", "tapo"] },

  // --- Porteros y accesos ---
  "PORTEROS":                         { category: "porteros", tags: [] },
  "COMMAX":                           { category: "porteros", tags: [] },
  "CONTROL DE ACCESOS":               { category: "accesos",  tags: [] },
  "CERRADURAS":                       { category: "cerraduras", tags: ["smart-lock"] },

  // --- Alarmas ---
  "ALARMAS / OTROS":                  { category: "alarmas", tags: [] },
  "INTELBRAS":                        { category: "alarmas", tags: [] },
  "SIRENAS":                          { category: "alarmas", tags: ["sirena"] },
  "BARRERAS Y SENSORES":              { category: "alarmas", tags: ["sensor"] },
  "CERCO ELECTRICO Y OTROS":          { category: "alarmas", tags: ["cerco"] },
  "INCENDIO":                         { category: "alarmas", tags: ["incendio"] },
  "DSC":                              { category: "alarmas", tags: ["dsc"] },

  // --- Redes ---
  "CONECTIVIDAD":                     { category: "redes", tags: [] },
  "TP-LINK - VARIOS":                 { category: "redes", tags: [] },
  "TP-LINK":                          { category: "redes", tags: [] },
  "TP-LINK SWITCH":                   { category: "redes", tags: ["switch"] },
  "TP-LINK Switch":                   { category: "redes", tags: ["switch"] },
  "TP-LINK ACCESS POINT":             { category: "redes", tags: ["access-point"] },
  "TP-LINK Access Point":             { category: "redes", tags: ["access-point"] },
  "UBIQUITI":                         { category: "redes", tags: ["ubiquiti"] },

  // --- Almacenamiento y otros ---
  "DISCOS RÍGIDOS":                   { category: "almacenamiento", tags: ["hdd"] },
  "MEMORIAS RAM":                     { category: "almacenamiento", tags: ["ram"] },
  "MEMORIAS MICROSD":                 { category: "almacenamiento", tags: ["microsd"] },
  "PENDRIVE":                         { category: "almacenamiento", tags: ["pendrive"] },
  "MONITORES":                        { category: "monitores", tags: [] },
  "OTROS":                            { category: "camaras", tags: [] },
  "NOVEDADES":                        { category: "camaras", tags: ["novedad"] },
};

// Cada pestaña arranca con productos antes de la primera fila de sección (en
// EZVIZ son las "NOVEDADES", que están en el encabezado y no en una fila).
// Esos caen acá. El importador los marca como fallback y los lista al final,
// porque la categoría es una suposición y conviene revisarla.
const TAB_DEFAULTS = {
  "Hilook":                    { category: "grabadores", tags: [] },
  "Hikvision Cctv-IP":         { category: "grabadores", tags: [] },
  "Hik Alarma/Portero/Acceso": { category: "alarmas",    tags: [] },
  "DAHUA":                     { category: "grabadores", tags: [] },
  "EZVIZ":                     { category: "camaras",    tags: ["novedad"] },
  "IMOU":                      { category: "camaras",    tags: [] },
  "Tp-Link":                   { category: "redes",      tags: [] },
  "Intelbras":                 { category: "alarmas",    tags: [] },
  "Accesorios / Varios":       { category: "grabadores", tags: [] },
  "Commax":                    { category: "porteros",   tags: [] },
  "hoja":                      { category: "almacenamiento", tags: [] },
  "KITS":                      { category: "kits",       tags: ["kit"] },
};

// Pestañas que no se importan, con el motivo.
const SKIP_TABS = {
  "Liq/Outlet":
    "usa otro layout de columnas y no tiene columna de modelo, así que no hay " +
    "clave estable para hacer upsert. Son productos de liquidación, rotan seguido.",
};

module.exports = { PROVIDERS, SECTIONS, TAB_DEFAULTS, SKIP_TABS };
