// Publicaciones propias en MercadoLibre, administradas desde /meli en el panel.
//
// Es la única pieza que habla con MercadoLibre: el token no puede estar en el
// navegador. El panel manda una acción y esto hace el trabajo:
//
//   status     cuenta conectada, o el link para conectarla
//   connect    canjea el code de la autorización por los tokens
//   prepare    arma la publicación de cada producto: categoría, título, precio
//   quote      recalcula el precio de publicaciones que todavía no salieron
//   validate   se la manda a MercadoLibre para que la revise, sin publicar
//   publish    la publica
//   update     pausa, activa o cambia la cantidad de una publicación
//   reprice    recalcula el precio de las publicadas y lo actualiza en ML
//   sync       trae estado, precio y ventas de las publicadas
//   attributes atributos que pide una categoría, para completarlos a mano
//   catalog    busca el producto en el catálogo de ML (para sacar el GTIN)
//   diagnose   valida un producto en variantes, para ver qué rechaza ML
//
// NO toca la tienda: no escribe en `products` ni cambia el precio de
// vigi.com.ar. Todo lo de MercadoLibre vive en `meli_listings` y
// `meli_settings`.
//
// Desplegar:
//   npx supabase functions deploy meli-listings --project-ref <REF>
// (o pegando este archivo en el editor del dashboard: no importa nada local).
// Usa los secrets MELI_CLIENT_ID, MELI_CLIENT_SECRET y R2_PUBLIC_URL, más los
// SUPABASE_* que inyecta Supabase.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const env = (k: string) => Deno.env.get(k) ?? "";

// ===========================================================================
// Acceso a MercadoLibre
//
// Va en este mismo archivo y no en ../_shared a propósito: el editor del
// dashboard de Supabase despliega solo index.ts, y un import a otra carpeta
// rompe el deploy con "Module not found".
//
// MercadoLibre no tiene client_credentials: los únicos grants son
// authorization_code y refresh_token, y cada refresh devuelve un refresh_token
// NUEVO que invalida al anterior. Por eso los tokens viven en la tabla
// `meli_credentials` (una sola fila, solo la toca la service role) y no en el
// entorno: si no se persiste la rotación, la integración se corta sola.
// ===========================================================================

const MELI_SITE = "MLA"; // Argentina
const MELI_API = "https://api.mercadolibre.com";

// Colchón para no usar un token que vence mientras estamos pidiendo.
const TOKEN_SKEW_MS = 60_000;

/** Guarda lo que devolvió /oauth/token. Antes de usarlo: el refresh viejo ya no sirve. */
const guardarToken = async (
  admin: SupabaseClient,
  token: { access_token: string; refresh_token?: string; expires_in?: number },
  refreshAnterior?: string
) => {
  const { error } = await admin.from("meli_credentials").upsert({
    id: true,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? refreshAnterior,
    expires_at: new Date(Date.now() + (token.expires_in ?? 21600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(
      `MercadoLibre devolvió un token pero no pude guardarlo, y el anterior ya no sirve: ${error.message}`
    );
  }
};

const pedirToken = async (params: Record<string, string>) => {
  const res = await fetch(`${MELI_API}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env("MELI_CLIENT_ID"),
      client_secret: env("MELI_CLIENT_SECRET"),
      ...params,
    }),
  });

  const token = await res.json().catch(() => ({}));

  if (!res.ok || !token.access_token) {
    throw new Error(
      `MercadoLibre rechazó el pedido de token (${res.status}): ${
        token.message ?? token.error_description ?? token.error ?? "sin detalle"
      }`
    );
  }

  return token;
};

/** Devuelve un access token válido, renovándolo si hace falta. */
const getAccessToken = async (admin: SupabaseClient): Promise<string> => {
  const { data: creds, error } = await admin
    .from("meli_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(`No pude leer las credenciales: ${error.message}`);
  if (!creds?.refresh_token) {
    throw new Error("MercadoLibre no está conectado: falta autorizar la cuenta.");
  }

  const vigente =
    creds.access_token &&
    creds.expires_at &&
    new Date(creds.expires_at).getTime() - TOKEN_SKEW_MS > Date.now();

  if (vigente) return creds.access_token as string;

  const token = await pedirToken({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
  });

  await guardarToken(admin, token, creds.refresh_token);
  return token.access_token as string;
};

/**
 * Canjea el `code` que MercadoLibre devuelve al autorizar la cuenta.
 *
 * El code dura pocos minutos y se usa una sola vez. `redirect_uri` tiene que
 * ser exactamente la misma que se usó para pedir la autorización.
 *
 * `codeVerifier` es el secreto de PKCE: la aplicación de MercadoLibre tiene
 * activado "Requiere PKCE", así que sin él el canje se rechaza. Lo genera el
 * panel al pedir la autorización y lo manda de vuelta acá.
 */
const conectarCuenta = async (
  admin: SupabaseClient,
  code: string,
  redirectUri: string,
  codeVerifier?: string
) => {
  const token = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });

  if (!token.refresh_token) {
    throw new Error(
      "MercadoLibre no devolvió refresh_token: la aplicación tiene que tener el permiso offline_access."
    );
  }

  await guardarToken(admin, token);
};

type MeliRespuesta<T = any> = { ok: boolean; status: number; data: T };

/** fetch contra la API, con el token y sin tirar excepción en errores HTTP. */
const meli = async <T = any>(
  token: string | null,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<MeliRespuesta<T>> => {
  const res = await fetch(`${MELI_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  // /items/validate responde 204 sin cuerpo cuando está todo bien.
  const texto = await res.text();
  let data: any = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = texto;
  }

  return { ok: res.ok, status: res.status, data };
};

/** El mensaje legible de un error de MercadoLibre, con las causas si vienen. */
const errorMeli = (r: MeliRespuesta) => {
  const d = r.data ?? {};
  const causas = Array.isArray(d.cause)
    ? d.cause
        .filter((c: any) => c?.type !== "warning")
        .map((c: any) => c?.message ?? c?.code)
        .filter(Boolean)
    : [];
  // A veces MercadoLibre responde 400 con solo avisos: son la única pista.
  const avisos = Array.isArray(d.cause)
    ? d.cause.map((c: any) => c?.message ?? c?.code).filter(Boolean)
    : [];
  const base = d.message ?? d.error ?? `MercadoLibre respondió ${r.status}`;
  const detalle = causas.length ? causas : avisos;
  return detalle.length ? `${base}: ${detalle.join(" · ")}` : String(base);
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const ASSETS = env("R2_PUBLIC_URL") || "https://vigi.orastudio.dev";

// Por pedido, para no pasarse del tiempo de una Edge Function. El panel manda
// los seleccionados en tandas de este tamaño.
const MAX_POR_PEDIDO = 10;

// MercadoLibre acepta hasta 60 caracteres de título en casi todas las
// categorías.
const MAX_TITULO = 60;

type Settings = {
  margin_pct: number;
  taxes_pct: number;
  listing_type_id: string;
  default_quantity: number;
  free_shipping_min: number;
  shipping_cost: number;
  rounding: number;
  vat: string;
  warranty_time: string;
};

type Producto = {
  id: string;
  model: string;
  title: string;
  provider: string | null;
  category: string;
  description: string | null;
  cost: number | null;
  gallery: number;
  thumbnail: string | null;
  location: "interior" | "exterior" | null;
  is_analogue: boolean;
  is_active: boolean;
  details: { specs?: string[] } | null;
};

type Listing = {
  id: string;
  product_id: string;
  meli_item_id: string | null;
  status: string;
  title: string | null;
  category_id: string | null;
  category_name: string | null;
  listing_type_id: string | null;
  quantity: number | null;
  attributes: Record<string, string>;
  price: number | null;
};

const CAMPOS_PRODUCTO =
  "id, model, title, provider, category, description, cost, gallery, thumbnail, location, is_analogue, is_active, details";

// Cómo se busca y se titula cada categoría de la tienda en MercadoLibre. La
// palabra va adelante del título porque es lo que la gente escribe en el
// buscador ("camara seguridad ezviz"), no el código de fábrica.
const PALABRA: Record<string, string> = {
  camaras: "Cámara De Seguridad",
  grabadores: "Grabador",
  alarmas: "Alarma",
  porteros: "Portero",
  almacenamiento: "Disco",
  kits: "Kit Cámaras De Seguridad",
  redes: "",
  cerraduras: "Cerradura Inteligente",
  accesos: "Control De Acceso",
  monitores: "Monitor",
};

// Estados de MercadoLibre que guardamos tal cual; el resto cae en "inactive".
const ESTADOS_ML = new Set(["active", "paused", "closed", "under_review", "inactive"]);
const estadoML = (s: string) => (ESTADOS_ML.has(s) ? s : "inactive");

// ---------------------------------------------------------------------------
// Armado de la publicación
// ---------------------------------------------------------------------------

const specsDe = (p: Producto): string[] =>
  p.details?.specs ??
  (p.description ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

// Proveedores cargados sin marca real. MercadoLibre los tomaría como marca, y
// una publicación de marca "Varios" no la encuentra nadie.
const SIN_MARCA = new Set(["varios", "otros", "generico", "sin marca"]);
const marca = (p: Producto) =>
  p.provider && !SIN_MARCA.has(norm(p.provider)) ? p.provider : null;

/** Título: palabra de la categoría + marca + modelo, y specs mientras entren. */
const armarTitulo = (p: Producto) => {
  const base = [PALABRA[p.category] ?? "", marca(p) ?? "", p.model]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  let titulo = base.slice(0, MAX_TITULO);
  for (const spec of specsDe(p)) {
    const candidato = `${titulo} ${spec}`;
    if (candidato.length > MAX_TITULO) break;
    titulo = candidato;
  }
  return titulo;
};

const urlModel = (m: string) => encodeURIComponent(m).replace(/%20/g, "+");

// Las mismas URLs públicas que usa la tienda. MercadoLibre las descarga y las
// copia a sus servidores: no quedan enlazadas a las nuestras.
const fotos = (p: Producto) => {
  const n = Math.min(Math.max(p.gallery ?? 0, 0), 10);
  const urls = Array.from({ length: n }, (_, i) => `${ASSETS}/gallery/${urlModel(p.model)}/${i}.png`);
  if (urls.length === 0 && p.thumbnail) urls.push(p.thumbnail);
  return urls.map((source) => ({ source }));
};

// Sin datos de contacto ni links: MercadoLibre los prohíbe en la descripción.
const armarDescripcion = (p: Producto, s: Settings) => {
  const lineas = [
    `${p.provider ?? ""} ${p.model}`.trim(),
    "",
    ...specsDe(p).map((x) => `- ${x}`),
    "",
    "Producto nuevo.",
    `Garantía de fábrica: ${s.warranty_time}.`,
  ];
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

type AtributoCategoria = {
  id: string;
  name: string;
  value_type: string;
  tags?: Record<string, boolean>;
  values?: Array<{ id: string; name: string }>;
};

const cacheAtributos = new Map<string, AtributoCategoria[]>();

const atributosDeCategoria = async (categoryId: string) => {
  const guardado = cacheAtributos.get(categoryId);
  if (guardado) return guardado;

  const r = await meli<AtributoCategoria[]>(null, `/categories/${categoryId}/attributes`);
  const lista = r.ok && Array.isArray(r.data) ? r.data : [];
  cacheAtributos.set(categoryId, lista);
  return lista;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Atributos de la publicación.
 *
 * Lo que se deduce del producto (marca, modelo, ubicación, IVA, motivo de GTIN
 * vacío) más lo cargado a mano en la fila, que tiene prioridad. Solo se mandan
 * los que existen en la categoría, y cuando la categoría tiene una lista de
 * valores se manda el value_id: con value_name suelto MercadoLibre a veces no
 * lo reconoce.
 */
const armarAtributos = async (p: Producto, l: Listing, s: Settings) => {
  const catAttrs = await atributosDeCategoria(l.category_id!);
  const porId = new Map(catAttrs.map((a) => [a.id, a]));

  const deducidos: Record<string, string> = {};
  const m = marca(p);
  if (m) deducidos.BRAND = m;
  deducidos.MODEL = p.model;
  if (p.location) {
    deducidos.CAMERA_LOCATIONS = p.location === "interior" ? "Interior" : "Exterior";
  }
  // Una cámara que no es analógica es IP. Las analógicas (domo, bala) no se
  // deducen: el formato no está en la base y hay que elegirlo a mano.
  if (p.category === "camaras" && !p.is_analogue) deducidos.SURVEILLANCE_CAMERA_TYPE = "IP";
  // No tenemos códigos de barras cargados. Sin GTIN, MercadoLibre pide el
  // motivo; si alguno se carga a mano, EMPTY_GTIN_REASON no se manda.
  const valores = { ...deducidos, ...(l.attributes ?? {}) };
  if (!valores.GTIN) valores.EMPTY_GTIN_REASON ??= "El producto no tiene código registrado";
  valores.VALUE_ADDED_TAX ??= s.vat;

  const salida: Array<{ id: string; value_id?: string; value_name?: string }> = [];
  for (const [id, valor] of Object.entries(valores)) {
    if (!valor) continue;
    const def = porId.get(id);
    if (!def) continue;

    const match = def.values?.find((v) => norm(v.name) === norm(String(valor)));
    salida.push(match ? { id, value_id: match.id } : { id, value_name: String(valor) });
  }
  return salida;
};

/** Cuerpo de POST /items. `modo` elige entre title y family_name (User Products). */
const armarItem = async (
  p: Producto,
  l: Listing,
  s: Settings,
  modo: "title" | "family"
) => {
  const titulo = (l.title || armarTitulo(p)).slice(0, MAX_TITULO);
  const precio = Number(l.price);

  return {
    ...(modo === "title" ? { title: titulo } : { family_name: titulo }),
    category_id: l.category_id,
    price: precio,
    currency_id: "ARS",
    available_quantity: l.quantity ?? s.default_quantity,
    buying_mode: "buy_it_now",
    condition: "new",
    listing_type_id: l.listing_type_id || s.listing_type_id,
    // Solo MercadoLibre: sin Mercado Shops, que sería otra tienda aparte de
    // vigi.com.ar.
    channels: ["marketplace"],
    pictures: fotos(p),
    attributes: await armarAtributos(p, l, s),
    sale_terms: [
      { id: "WARRANTY_TYPE", value_name: "Garantía de fábrica" },
      { id: "WARRANTY_TIME", value_name: s.warranty_time },
    ],
    shipping: {
      mode: "me2",
      local_pick_up: false,
      free_shipping: precio >= s.free_shipping_min,
    },
  };
};

// Cuentas pasadas al modelo User Products no aceptan `title` y piden
// `family_name`. No hay un endpoint claro para saber de antemano en qué modelo
// está la cuenta, así que se prueba con title y, si el error lo menciona, se
// repite con family_name.
const pideFamilyName = (r: { data: any }) =>
  JSON.stringify(r.data ?? "").toLowerCase().includes("family_name");

// Con family_name (cuentas en el modelo User Products), /items/validate
// responde 400 "Validation error" trayendo solo avisos y ningún error, aun con
// la publicación completa: probado con 18 variantes el 29/09/2026. Cuando es
// así, la validación no está diciendo que falte algo, así que se toma como
// aprobada. Si hay aunque sea un error, frena como siempre.
const soloAvisos = (r: { ok: boolean; data: any }) => {
  if (r.ok) return false;
  const causas = Array.isArray(r.data?.cause) ? r.data.cause : [];
  return causas.length > 0 && causas.every((c: any) => c?.type === "warning");
};

// ---------------------------------------------------------------------------
// Catálogo: de dónde sale el GTIN
// ---------------------------------------------------------------------------

// Para marcas registradas (Ezviz, Dahua, Commax, Hikvision…) MercadoLibre exige
// el GTIN (código de barras) y no acepta EMPTY_GTIN_REASON. La base no tiene
// códigos de barras, pero el catálogo de MercadoLibre sí: se busca el producto
// por marca y modelo y se toma el GTIN del que tenga exactamente el mismo
// modelo. Si el modelo no coincide, no se adivina: mejor cargarlo a mano que
// publicar con el código de otro producto.

type Candidato = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  gtin: string | null;
  thumbnail: string | null;
  exacto: boolean;
};

// Solo letras y números: "DS-2CE76K0T" y "DS2CE76K0T" son el mismo modelo.
const modeloNorm = (s: string) => norm(s).replace(/[^a-z0-9]/g, "");

const valorAttr = (attrs: any[], id: string): string | null => {
  const a = (attrs ?? []).find((x: any) => x?.id === id);
  return a?.value_name ?? a?.values?.[0]?.name ?? null;
};

const buscarEnCatalogo = async (token: string, p: Producto): Promise<Candidato[]> => {
  const q = encodeURIComponent([marca(p) ?? "", p.model].join(" ").trim());
  const r = await meli<any>(token, `/products/search?status=active&site_id=${MELI_SITE}&q=${q}&limit=10`);
  if (!r.ok) throw new Error(`No pude buscar en el catálogo: ${errorMeli(r)}`);

  const buscado = modeloNorm(p.model);
  return (r.data?.results ?? []).map((x: any) => {
    const model = valorAttr(x.attributes, "MODEL");
    return {
      id: x.id,
      name: x.name,
      brand: valorAttr(x.attributes, "BRAND"),
      model,
      gtin: valorAttr(x.attributes, "GTIN"),
      thumbnail: x.pictures?.[0]?.url ?? null,
      exacto: Boolean(model && modeloNorm(model) === buscado),
    };
  });
};

/** El GTIN del candidato del catálogo con el mismo modelo, si hay uno solo claro. */
const gtinDeCatalogo = (cands: Candidato[]) => {
  const conGtin = cands.filter((c) => c.exacto && c.gtin);
  const distintos = new Set(conGtin.map((c) => c.gtin));
  // Dos productos "iguales" con códigos distintos: no se elige por el usuario.
  return distintos.size === 1 ? conGtin[0].gtin : null;
};

// ---------------------------------------------------------------------------
// Precio
// ---------------------------------------------------------------------------

type Comision = { total: number; porcentaje: number; fijo: number };

const comision = async (
  token: string,
  precio: number,
  listingType: string,
  categoryId: string
): Promise<Comision> => {
  const r = await meli<any>(
    token,
    `/sites/${MELI_SITE}/listing_prices?price=${precio}&listing_type_id=${listingType}&category_id=${categoryId}`
  );
  if (!r.ok) throw new Error(`No pude consultar la comisión: ${errorMeli(r)}`);

  const lista = Array.isArray(r.data) ? r.data : [r.data];
  const fila = lista.find((x: any) => x?.listing_type_id === listingType) ?? lista[0];
  const det = fila?.sale_fee_details ?? {};

  const porcentaje = Number(det.percentage_fee ?? 0);
  const fijo = Number(det.fixed_fee ?? 0);
  // sale_fee_amount ya incluye el cargo fijo.
  const total = Number(fila?.sale_fee_amount ?? (precio * porcentaje) / 100 + fijo);

  if (!Number.isFinite(total)) throw new Error("MercadoLibre devolvió una comisión sin número");
  return { total, porcentaje, fijo };
};

const redondearArriba = (n: number, multiplo: number) => Math.ceil(n / multiplo) * multiplo;

/**
 * El menor precio que deja la ganancia buscada.
 *
 * ganancia = precio − comisión(precio) − envío(precio) − impuestos − costo
 *
 * La comisión de MercadoLibre depende del precio (porcentaje más un cargo fijo
 * que cambia por tramo), y el envío gratis aparece al pasar un umbral. Por eso
 * no hay una fórmula cerrada: se estima, se pregunta la comisión real para ese
 * precio y se ajusta, hasta que el precio no cambia.
 */
const cotizar = async (
  token: string,
  costo: number,
  s: Settings,
  categoryId: string,
  listingType: string
) => {
  const objetivo = costo * (1 + Number(s.margin_pct) / 100);
  const imp = Number(s.taxes_pct) / 100;

  let precio = redondearArriba(objetivo / (1 - 0.16 - imp), s.rounding);
  let anterior = 0;

  for (let i = 0; i < 8 && precio !== anterior; i++) {
    const c = await comision(token, precio, listingType, categoryId);
    const envio = precio >= s.free_shipping_min ? Number(s.shipping_cost) : 0;
    const nuevo = redondearArriba(
      (objetivo + c.fijo + envio) / (1 - c.porcentaje / 100 - imp),
      s.rounding
    );
    anterior = precio;
    // Si queda oscilando alrededor del umbral de envío gratis, gana el más
    // alto: mejor cobrar un poco más que perder plata.
    precio = i >= 5 ? Math.max(nuevo, precio) : nuevo;
  }

  const c = await comision(token, precio, listingType, categoryId);
  const envio = precio >= s.free_shipping_min ? Number(s.shipping_cost) : 0;
  const impuestos = Math.round(precio * imp);
  const ganancia = Math.round(precio - c.total - envio - impuestos - costo);

  return {
    price: precio,
    cost_basis: costo,
    fee_amount: Math.round(c.total),
    shipping_cost: envio,
    taxes_amount: impuestos,
    net_profit: ganancia,
    quoted_at: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    // Con el token del usuario: admin_users pasa por RLS y la whitelist sigue
    // siendo la única fuente de verdad.
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization) return json({ error: "Falta el token" }, 401);

    const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: esAdmin } = await caller.from("admin_users").select("email").maybeSingle();
    if (!esAdmin) return json({ error: "No autorizado" }, 403);

    const body = await req.json().catch(() => ({}));
    const accion = String(body.action ?? "");

    // Service role: credenciales y escritura de estado y precio.
    const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

    // --- Conexión -----------------------------------------------------------
    if (accion === "status") {
      const clientId = env("MELI_CLIENT_ID");
      const redirect = String(body.redirect_uri ?? "");
      // PKCE: el panel genera el verifier, lo guarda y manda acá solo el
      // challenge (su SHA-256). El verifier vuelve recién en `connect`.
      const challenge = String(body.code_challenge ?? "");
      const authUrl = clientId && redirect
        ? `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
          (challenge ? `&code_challenge=${challenge}&code_challenge_method=S256` : "")
        : null;

      try {
        const token = await getAccessToken(db);
        const r = await meli(token, "/users/me");
        if (!r.ok) return json({ connected: false, auth_url: authUrl, error: errorMeli(r) });
        // Qué le falta a la cuenta para publicar. MercadoLibre rechaza la
        // validación con un 400 sin causa concreta cuando la cuenta no puede
        // listar (sin datos fiscales, sin domicilio, sin Mercado Envíos…), y
        // estos códigos son la única pista de por qué.
        const st = r.data.status ?? {};
        return json({
          connected: true,
          user: {
            id: r.data.id,
            nickname: r.data.nickname,
            permalink: r.data.permalink,
            level: r.data.seller_reputation?.level_id ?? null,
          },
          can_list: st.list?.allow ?? null,
          list_codes: st.list?.codes ?? [],
          can_sell: st.sell?.allow ?? null,
          sell_codes: st.sell?.codes ?? [],
          mercadoenvios: st.mercadoenvios ?? null,
        });
      } catch (e) {
        return json({ connected: false, auth_url: authUrl, error: (e as Error).message });
      }
    }

    if (accion === "connect") {
      const code = String(body.code ?? "").trim();
      const redirect = String(body.redirect_uri ?? "").trim();
      if (!code || !redirect) return json({ error: "Faltan code o redirect_uri" }, 400);
      await conectarCuenta(db, code, redirect, String(body.code_verifier ?? "") || undefined);
      return json({ ok: true });
    }

    if (accion === "attributes") {
      const cat = String(body.category_id ?? "");
      if (!cat) return json({ error: "Falta category_id" }, 400);
      const attrs = await atributosDeCategoria(cat);
      return json({
        attributes: attrs
          .filter((a) => a.tags?.required || a.tags?.catalog_required || a.tags?.conditional_required)
          .filter((a) => !a.tags?.hidden || a.id === "EMPTY_GTIN_REASON")
          .map((a) => ({
            id: a.id,
            name: a.name,
            required: Boolean(a.tags?.required || a.tags?.catalog_required),
            values: (a.values ?? []).map((v) => v.name),
          })),
      });
    }

    // --- Todo lo que sigue necesita la cuenta y la configuración -------------
    const token = await getAccessToken(db);

    const { data: settings, error: errSettings } = await db
      .from("meli_settings")
      .select("*")
      .eq("id", true)
      .single();
    if (errSettings) throw new Error(`No pude leer la configuración: ${errSettings.message}`);
    const s = settings as Settings;

    const ids: string[] = Array.isArray(body.product_ids)
      ? body.product_ids.map(String).slice(0, MAX_POR_PEDIDO)
      : body.product_id
        ? [String(body.product_id)]
        : [];

    const traerProductos = async () => {
      const { data, error } = await db.from("products").select(CAMPOS_PRODUCTO).in("id", ids);
      if (error) throw new Error(error.message);
      return new Map((data as Producto[]).map((p) => [p.id, p]));
    };

    const traerListings = async (productIds?: string[]) => {
      let q = db.from("meli_listings").select("*");
      if (productIds) q = q.in("product_id", productIds);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return new Map((data as Listing[]).map((l) => [l.product_id, l]));
    };

    const guardar = async (productId: string, cambios: Record<string, unknown>) => {
      const { error } = await db.from("meli_listings").update(cambios).eq("product_id", productId);
      if (error) throw new Error(error.message);
    };

    type Salida = { ok: boolean; message?: string; [k: string]: unknown };
    type Resultado = Salida & { product_id: string };
    const resultados: Resultado[] = [];

    // Cada producto por separado: uno que falla no frena a los demás.
    const porProducto = async (fn: (id: string) => Promise<Salida>) => {
      for (const id of ids) {
        try {
          resultados.push({ product_id: id, ...(await fn(id)) });
        } catch (e) {
          resultados.push({ product_id: id, ok: false, message: (e as Error).message });
        }
      }
      return json({ results: resultados });
    };

    // --- Preparar -----------------------------------------------------------
    if (accion === "prepare") {
      const productos = await traerProductos();
      const listings = await traerListings(ids);

      return porProducto(async (id) => {
        const p = productos.get(id);
        if (!p) return { ok: false, message: "No existe el producto" };
        if (p.cost == null) return { ok: false, message: "El producto no tiene costo cargado" };

        const actual = listings.get(id);
        if (actual?.meli_item_id) {
          return { ok: false, message: "Ya está publicado: usá Actualizar precio" };
        }

        // La categoría la sugiere MercadoLibre a partir del título. Si ya se
        // eligió una a mano, se respeta.
        let categoryId = actual?.category_id ?? null;
        let categoryName = actual?.category_name ?? null;
        const attrs: Record<string, string> = { ...(actual?.attributes ?? {}) };

        if (!categoryId) {
          const q = encodeURIComponent(armarTitulo(p));
          const r = await meli<any[]>(
            null,
            `/sites/${MELI_SITE}/domain_discovery/search?q=${q}&limit=1`
          );
          const sug = r.ok && Array.isArray(r.data) ? r.data[0] : null;
          if (!sug?.category_id) {
            return { ok: false, message: "MercadoLibre no sugirió categoría: elegila a mano" };
          }
          categoryId = sug.category_id;
          categoryName = sug.category_name;
          for (const a of sug.attributes ?? []) {
            if (a?.id && a?.value_name && !attrs[a.id]) attrs[a.id] = a.value_name;
          }
        }

        // GTIN desde el catálogo, si no hay uno cargado. Si la búsqueda falla o
        // no hay coincidencia exacta, se sigue: el validar dirá si hace falta.
        let gtinNota = "";
        if (!attrs.GTIN) {
          try {
            const gtin = gtinDeCatalogo(await buscarEnCatalogo(token, p));
            if (gtin) attrs.GTIN = gtin;
            else gtinNota = " (sin GTIN: no se encontró en el catálogo)";
          } catch {
            gtinNota = " (no se pudo consultar el catálogo)";
          }
        }

        const listingType = actual?.listing_type_id || s.listing_type_id;
        const cotizacion = await cotizar(token, Number(p.cost), s, categoryId!, listingType);

        const fila = {
          product_id: id,
          status: "draft",
          title: actual?.title || armarTitulo(p),
          category_id: categoryId,
          category_name: categoryName,
          listing_type_id: listingType,
          quantity: actual?.quantity ?? s.default_quantity,
          attributes: attrs,
          errors: null,
          ...cotizacion,
        };

        const { error } = await db.from("meli_listings").upsert(fila, { onConflict: "product_id" });
        if (error) throw new Error(error.message);

        return {
          ok: true,
          price: cotizacion.price,
          net_profit: cotizacion.net_profit,
          ...(gtinNota ? { message: `Preparada${gtinNota}` } : {}),
        };
      });
    }

    // --- Catálogo -----------------------------------------------------------
    if (accion === "catalog") {
      const productos = await traerProductos();
      const p = productos.get(ids[0]);
      if (!p) return json({ error: "No existe el producto" }, 404);
      return json({ candidates: await buscarEnCatalogo(token, p) });
    }

    // --- Diagnóstico ---------------------------------------------------------
    // Valida la publicación de un producto en varias variantes, para aislar qué
    // campo hace que MercadoLibre la rechace cuando no dice por qué. Solo usa
    // /items/validate: no crea nada.
    if (accion === "diagnose") {
      const productos = await traerProductos();
      const listings = await traerListings(ids);
      const p = productos.get(ids[0]);
      const l = listings.get(ids[0]);
      if (!p || !l?.category_id || !l.price) return json({ error: "Primero hay que prepararla" }, 400);

      const modo = body.mode === "family" ? "family" : "title";
      const base: Record<string, unknown> = await armarItem(p, l, s, modo);

      // Variantes a probar: { nombre: { set: {campo: valor}, unset: ["campo"] } }.
      // Si el panel no manda ninguna, se prueba la publicación tal cual.
      const pedidas: Record<string, { set?: Record<string, unknown>; unset?: string[] }> =
        body.variants && typeof body.variants === "object" ? body.variants : { tal_cual: {} };

      const variantes: Record<string, unknown> = {};
      for (const [nombre, v] of Object.entries(pedidas).slice(0, 8)) {
        const cuerpo: Record<string, unknown> = { ...base, ...(v?.set ?? {}) };
        for (const campo of v?.unset ?? []) delete cuerpo[campo];
        variantes[nombre] = cuerpo;
      }

      const resultados: Record<string, unknown> = {};
      for (const [nombre, cuerpo] of Object.entries(variantes)) {
        const r = await meli(token, "/items/validate", { method: "POST", body: cuerpo });
        resultados[nombre] = { status: r.status, respuesta: r.data };
      }

      const me = await meli<any>(token, "/users/me");
      const prefs = me.ok
        ? await meli<any>(token, `/users/${me.data.id}/shipping_preferences`)
        : null;

      return json({
        item: base,
        validaciones: resultados,
        shipping_preferences: prefs?.data ?? null,
      });
    }

    // --- Recotizar (sin publicar) ------------------------------------------
    if (accion === "quote") {
      const productos = await traerProductos();
      const listings = await traerListings(ids);

      return porProducto(async (id) => {
        const p = productos.get(id);
        const l = listings.get(id);
        if (!p || !l) return { ok: false, message: "Primero hay que prepararla" };
        if (p.cost == null) return { ok: false, message: "El producto no tiene costo cargado" };
        if (!l.category_id) return { ok: false, message: "Falta la categoría" };

        const c = await cotizar(token, Number(p.cost), s, l.category_id, l.listing_type_id || s.listing_type_id);
        await guardar(id, { ...c, ...(l.meli_item_id ? {} : { status: "draft" }) });
        return { ok: true, price: c.price, net_profit: c.net_profit };
      });
    }

    // --- Validar y publicar -------------------------------------------------
    if (accion === "validate" || accion === "publish") {
      const productos = await traerProductos();
      const listings = await traerListings(ids);

      return porProducto(async (id) => {
        const p = productos.get(id);
        const l = listings.get(id);
        if (!p || !l) return { ok: false, message: "Primero hay que prepararla" };
        if (!p.is_active) return { ok: false, message: "El producto está desactivado en la tienda" };
        if (l.meli_item_id) return { ok: false, message: "Ya está publicada" };
        if (!l.category_id || !l.price) return { ok: false, message: "Falta categoría o precio" };

        // Primero siempre se valida: si MercadoLibre la rechaza, no se crea nada.
        let modo: "title" | "family" = "title";
        let item = await armarItem(p, l, s, modo);
        let v = await meli(token, "/items/validate", { method: "POST", body: item });

        if (!v.ok && pideFamilyName(v)) {
          modo = "family";
          item = await armarItem(p, l, s, modo);
          v = await meli(token, "/items/validate", { method: "POST", body: item });
        }

        const conAvisos = soloAvisos(v);
        if (!v.ok && !conAvisos) {
          await guardar(id, { status: "error", errors: v.data });
          return { ok: false, message: errorMeli(v) };
        }

        if (accion === "validate") {
          // Los avisos se guardan igual, para que se vean en la fila.
          await guardar(id, { status: "ready", errors: conAvisos ? v.data : null });
          return {
            ok: true,
            message: conAvisos
              ? `Sin errores (MercadoLibre solo avisa: ${errorMeli(v)})`
              : "MercadoLibre la validó sin errores",
          };
        }

        const r = await meli<any>(token, "/items", { method: "POST", body: item });
        if (!r.ok) {
          await guardar(id, { status: "error", errors: r.data });
          return { ok: false, message: errorMeli(r) };
        }

        // Se guarda el id enseguida: si lo que sigue falla, la publicación ya
        // existe y no hay que volver a crearla.
        await guardar(id, {
          meli_item_id: r.data.id,
          status: estadoML(r.data.status),
          permalink: r.data.permalink ?? null,
          errors: null,
          synced_at: new Date().toISOString(),
        });

        // La descripción va aparte: MercadoLibre la ignora dentro de POST /items.
        const d = await meli(token, `/items/${r.data.id}/description`, {
          method: "POST",
          body: { plain_text: armarDescripcion(p, s) },
        });

        return {
          ok: true,
          meli_item_id: r.data.id,
          permalink: r.data.permalink,
          message: d.ok ? "Publicada" : `Publicada, pero sin descripción: ${errorMeli(d)}`,
        };
      });
    }

    // --- Cambios sobre publicadas -------------------------------------------
    if (accion === "update") {
      const listings = await traerListings(ids);

      return porProducto(async (id) => {
        const l = listings.get(id);
        if (!l?.meli_item_id) return { ok: false, message: "No está publicada" };

        const cambios: Record<string, unknown> = {};
        if (["active", "paused", "closed"].includes(body.status)) cambios.status = body.status;
        if (Number.isInteger(body.quantity) && body.quantity >= 0) {
          cambios.available_quantity = body.quantity;
        }
        if (Object.keys(cambios).length === 0) return { ok: false, message: "Nada para cambiar" };

        const r = await meli<any>(token, `/items/${l.meli_item_id}`, { method: "PUT", body: cambios });
        if (!r.ok) return { ok: false, message: errorMeli(r) };

        await guardar(id, {
          status: estadoML(r.data.status),
          quantity: r.data.available_quantity ?? l.quantity,
          synced_at: new Date().toISOString(),
        });
        return { ok: true };
      });
    }

    if (accion === "reprice") {
      const productos = await traerProductos();
      const listings = await traerListings(ids);

      return porProducto(async (id) => {
        const p = productos.get(id);
        const l = listings.get(id);
        if (!p || !l?.meli_item_id) return { ok: false, message: "No está publicada" };
        if (p.cost == null) return { ok: false, message: "El producto no tiene costo cargado" };

        const c = await cotizar(token, Number(p.cost), s, l.category_id!, l.listing_type_id || s.listing_type_id);

        if (Number(l.price) !== c.price) {
          const r = await meli(token, `/items/${l.meli_item_id}`, {
            method: "PUT",
            body: { price: c.price },
          });
          if (!r.ok) return { ok: false, message: errorMeli(r) };
        }

        await guardar(id, { ...c, synced_at: new Date().toISOString() });
        return {
          ok: true,
          price: c.price,
          changed: Number(l.price) !== c.price,
          net_profit: c.net_profit,
        };
      });
    }

    // --- Sincronizar --------------------------------------------------------
    if (accion === "sync") {
      const { data, error } = await db
        .from("meli_listings")
        .select("product_id, meli_item_id")
        .not("meli_item_id", "is", null);
      if (error) throw new Error(error.message);

      const filas = data as Array<{ product_id: string; meli_item_id: string }>;
      const porItem = new Map(filas.map((f) => [f.meli_item_id, f.product_id]));
      let actualizadas = 0;

      // El multiget acepta hasta 20 ids por pedido.
      for (let i = 0; i < filas.length; i += 20) {
        const lote = filas.slice(i, i + 20).map((f) => f.meli_item_id);
        const r = await meli<any[]>(
          token,
          `/items?ids=${lote.join(",")}&attributes=id,status,price,available_quantity,sold_quantity,permalink`
        );
        if (!r.ok || !Array.isArray(r.data)) continue;

        for (const x of r.data) {
          const it = x?.body;
          if (x?.code !== 200 || !it?.id) continue;
          const productId = porItem.get(it.id);
          if (!productId) continue;

          await guardar(productId, {
            status: estadoML(it.status),
            price: it.price,
            quantity: it.available_quantity,
            sold_quantity: it.sold_quantity ?? 0,
            permalink: it.permalink,
            synced_at: new Date().toISOString(),
          });
          actualizadas++;
        }
      }

      return json({ ok: true, synced: actualizadas, total: filas.length });
    }

    return json({ error: `Acción desconocida: ${accion}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
