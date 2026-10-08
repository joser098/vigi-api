/**
 * Cliente de la API MiCorreo (Correo Argentino).
 *
 * Spec y respuestas reales: vigi-admin/docs/correo-argentino.md. Lo que no
 * coincide con el PDF oficial y ya mordió:
 *
 *   - `/token` devuelve el vencimiento en `expire`, no en `expires`.
 *   - `/rates` responde 202, no 200: todo 2xx es éxito.
 *   - Casi todo error de negocio es 402 con `{ code, message }` en texto libre,
 *     que se puede mostrar tal cual.
 *
 * Variables: MICORREO_BASE_URL, MICORREO_USER, MICORREO_PASSWORD,
 * MICORREO_CUSTOMER_ID, MICORREO_CP_ORIGEN.
 */
const { joinUrl } = require("../utils/urls");

const TIMEOUT_MS = 20000;

// Las sucursales casi no cambian y una provincia trae cientos: se piden una
// vez cada tantas horas y no en cada carga del checkout.
const AGENCIES_TTL_MS = 6 * 60 * 60 * 1000;

const env = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

class MiCorreoError extends Error {
  constructor(status, message) {
    super(message || `MiCorreo respondió ${status}`);
    this.name = "MiCorreoError";
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fetch con reintentos. El servidor de MiCorreo (detrás de Imperva) corta
 * conexiones de vez en cuando sin responder nada (ECONNRESET / "other side
 * closed"), con cualquier cliente: pasó con curl por HTTP/2 y con el fetch de
 * Node. El mismo pedido un segundo después anda. También reintenta los 429,
 * como pide el PDF.
 *
 * Solo se usa para pedidos sin efectos (token, cotizar, sucursales): un
 * /shipping/import NO debe pasar por acá sin pensarlo, aunque MiCorreo rechaza
 * una orden ya importada.
 */
const fetchWithRetry = async (url, options, attempts = 3) => {
  for (let i = 1; ; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status !== 429 || i >= attempts) return response;
    } catch (error) {
      if (i >= attempts) throw error;
    }

    await sleep(500 * 2 ** (i - 1));
  }
};

const parse = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

let cachedToken = null; // { token, expiresAt }

// `expire` viene como "2026-10-08 16:32:19", hora argentina y sin zona.
const parseExpire = (expire) => {
  const ms = Date.parse(`${String(expire).replace(" ", "T")}-03:00`);
  // Si el formato cambia, un token de 10 minutos es mejor que uno eterno.
  return Number.isNaN(ms) ? Date.now() + 10 * 60 * 1000 : ms;
};

const fetchToken = async () => {
  const basic = Buffer.from(
    `${env("MICORREO_USER")}:${env("MICORREO_PASSWORD")}`
  ).toString("base64");

  const response = await fetchWithRetry(joinUrl(env("MICORREO_BASE_URL"), "/token"), {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = await parse(response);

  if (!response.ok || !body?.token) {
    throw new MiCorreoError(response.status, body?.message);
  }

  // Un minuto de margen para no mandar un token que vence en el camino.
  cachedToken = {
    token: body.token,
    expiresAt: parseExpire(body.expire) - 60 * 1000,
  };

  return cachedToken.token;
};

// Varios bultos se cotizan en paralelo: que compartan un solo pedido de token.
let tokenInFlight = null;

const getToken = async () => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  tokenInFlight ??= fetchToken().finally(() => {
    tokenInFlight = null;
  });

  return tokenInFlight;
};

/**
 * Llamada autenticada. Ante un 401 renueva el token y reintenta una vez: el
 * vencimiento que informa MiCorreo es orientativo.
 */
const request = async (path, { method = "GET", body } = {}, retried = false) => {
  const response = await fetchWithRetry(joinUrl(env("MICORREO_BASE_URL"), path), {
    method,
    headers: {
      Authorization: `Bearer ${await getToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !retried) {
    cachedToken = null;
    return request(path, { method, body }, true);
  }

  const data = await parse(response);

  if (!response.ok) {
    throw new MiCorreoError(response.status, data?.message);
  }

  return data;
};

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

/**
 * CP de 4 dígitos, que es lo que pide MiCorreo. Las direcciones guardan lo que
 * escribió el cliente: "5000", "X5000ABC" o "B1704 " salen todos bien.
 */
const toCp4 = (zip) => {
  const match = String(zip ?? "").match(/\d{4}/);
  if (!match) throw new MiCorreoError(400, `Código postal inválido: ${zip}`);
  return match[0];
};

// Códigos de provincia de MiCorreo, por el nombre de la tabla `provinces`.
const PROVINCE_CODES = {
  salta: "A",
  "buenos aires": "B",
  "ciudad autonoma de buenos aires": "C",
  caba: "C",
  "c.a.b.a.": "C",
  "capital federal": "C",
  "ciudad de buenos aires": "C",
  "san luis": "D",
  "entre rios": "E",
  "la rioja": "F",
  "santiago del estero": "G",
  chaco: "H",
  "san juan": "J",
  catamarca: "K",
  "la pampa": "L",
  mendoza: "M",
  misiones: "N",
  formosa: "P",
  neuquen: "Q",
  "rio negro": "R",
  "santa fe": "S",
  tucuman: "T",
  chubut: "U",
  "tierra del fuego": "V",
  corrientes: "W",
  cordoba: "X",
  jujuy: "Y",
  "santa cruz": "Z",
};

const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const provinceCode = (province) => PROVINCE_CODES[normalize(province)] ?? null;

/**
 * Cotiza un bulto. Devuelve las tarifas de domicilio y sucursal del servicio
 * Clásico (`CP`): MiCorreo también cotiza Expreso, pero se decidió ofrecer
 * solo Clásico.
 *
 * @param bulto { weight (g), height, width, length (cm) }, enteros.
 * @returns {{ D: Rate|null, S: Rate|null, validTo: string|null }}
 *   Rate = { price, productName, deliveryTimeMin, deliveryTimeMax }
 */
const rates = async (zipDestino, bulto) => {
  const data = await request("/rates", {
    method: "POST",
    body: {
      customerId: env("MICORREO_CUSTOMER_ID"),
      postalCodeOrigin: toCp4(env("MICORREO_CP_ORIGEN")),
      postalCodeDestination: toCp4(zipDestino),
      dimensions: {
        weight: bulto.weight,
        height: bulto.height,
        width: bulto.width,
        length: bulto.length,
      },
    },
  });

  const pick = (type) => {
    const rate = (data?.rates ?? []).find(
      (r) => r.deliveredType === type && r.productType === "CP"
    );
    return rate
      ? {
          price: Number(rate.price),
          productName: rate.productName,
          deliveryTimeMin: Number(rate.deliveryTimeMin) || null,
          deliveryTimeMax: Number(rate.deliveryTimeMax) || null,
        }
      : null;
  };

  return { D: pick("D"), S: pick("S"), validTo: data?.validTo ?? null };
};

// ---------------------------------------------------------------------------
// Sucursales
// ---------------------------------------------------------------------------

const agenciesCache = new Map(); // provinceCode -> { at, list }

const formatAgency = (a) => {
  const addr = a.location?.address ?? {};
  return {
    code: a.code,
    name: a.name,
    address: [addr.streetName, addr.streetNumber].filter(Boolean).join(" "),
    locality: addr.locality ?? null,
    city: addr.city ?? null,
    province: addr.province ?? null,
    postal_code: addr.postalCode ?? null,
    phone: a.phone ?? null,
    hours: a.hours ?? null,
    latitude: a.location?.latitude ? Number(a.location.latitude) : null,
    longitude: a.location?.longitude ? Number(a.location.longitude) : null,
    near_postal_codes: String(a.nearByPostalCode ?? "")
      .split(",")
      .map((cp) => cp.trim())
      .filter(Boolean),
  };
};

/** Sucursales activas de una provincia que entregan paquetes al cliente. */
const agencies = async (code) => {
  const hit = agenciesCache.get(code);
  if (hit && Date.now() - hit.at < AGENCIES_TTL_MS) return hit.list;

  const data = await request(
    `/agencies?customerId=${encodeURIComponent(
      env("MICORREO_CUSTOMER_ID")
    )}&provinceCode=${encodeURIComponent(code)}`
  );

  const list = (Array.isArray(data) ? data : [])
    .filter((a) => a.status === "ACTIVE" && a.services?.pickupAvailability)
    .map(formatAgency);

  agenciesCache.set(code, { at: Date.now(), list });
  return list;
};

module.exports = {
  rates,
  agencies,
  provinceCode,
  toCp4,
  MiCorreoError,
};
