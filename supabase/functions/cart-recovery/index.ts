// Recupero de carritos abandonados.
//
// Corre cada hora por cron (ver README). Busca los carritos que tienen un mail
// pendiente —`cart_recovery_open_carts()`, migración 0021— y manda el que
// toca:
//
//   1. Recordatorio: "tu carrito sigue acá".
//   2. Beneficios: seguridad, garantía, envío, pago. Sin descuento.
//   3. Cupón personal, calculado contra el costo del carrito.
//
// Quién recibe qué y cuánto descuento aguanta cada carrito lo decide la base.
// Acá solo se arma el mail, se crea el cupón y se manda.
//
// Tres formas de llamarla:
//
//   - el cron, con el header `x-cron-secret`;
//   - el panel, con el token del admin: { action: "run" } corre lo mismo que
//     el cron, { action: "preview", step } devuelve el HTML sin mandar nada y
//     { action: "test", step, email } lo manda a una dirección de prueba.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// --- Proveedores y cuota -----------------------------------------------------
// Este bloque está IGUAL en marketing-send y en cart-recovery: si se cambia en
// una, se cambia en la otra. Va copiado en cada function (y no en un archivo
// compartido) para que se pueda desplegar pegando el archivo en el dashboard.
// Lo que comparten las functions que mandan mails de marketing:
// `marketing-send` (campañas) y `cart-recovery` (carritos abandonados).
//
// Las dos salen por los mismos proveedores y con la misma cuota diaria. Si
// cada una llevara sus propios números, entre las dos se pasarían del plan
// gratuito y se llevarían puestos los mails de confirmación de compra de
// vigi-api, que usan la misma API key de Resend.
//
//   - Unitpost manda el marketing. Su plan gratuito son 100 por día (anuncia
//     200, pero pasados los 100 rebotan) y 5000 por mes, y no los comparte con nada.
//   - Resend queda para lo transaccional de vigi-api (confirmaciones de
//     compra). Lo que esos mails no usan de sus 100 diarios se aprovecha acá
//     como desborde, dejando siempre una reserva para que una compra nunca se
//     quede sin su mail.


type Proveedor = "unitpost" | "resend";

// Los dos aceptan hasta 100 mails por llamada al endpoint batch.
const LOTE = 100;

// Plan gratuito de Unitpost: 5000 por mes con corte duro. El plan anuncia 200
// por día, pero en la práctica entrega 100 y el resto rebota o falla, así que
// se toma 100. Las pruebas también descuentan y no dejan fila en la base: el
// colchón es para ellas.
const UNITPOST_DIARIO = 100;
const UNITPOST_MENSUAL = 5000;
const UNITPOST_COLCHON = 5;

// Plan gratuito de Resend: 100 por día, compartidos con los transaccionales de
// vigi-api, que salen con la misma API key. El marketing usa como mucho lo que
// queda después de la reserva: si una campaña se come los 100, las
// confirmaciones de compra del día no salen.
const RESEND_DIARIO = 100;
const RESEND_RESERVA = 30;

/**
 * El remitente, con nombre para mostrar.
 *
 * Sin nombre, la bandeja de entrada muestra la parte de antes del arroba: un
 * mail de "marketing@notification.vigi.com.ar" llega firmado por
 * **marketing**, que no le dice nada a nadie. Con nombre llega como **Vigi**.
 *
 * El nombre sale de quien llama (la campaña, por ejemplo). Si no trae, se usa
 * el que ya venga en el secreto, y si tampoco, "Vigi". Va entre comillas
 * porque un nombre con coma o con punto sin comillas rompe la cabecera.
 */
const remitente = (bruto: string, nombre: string | null) => {
  const conAngulos = bruto.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  const direccion = (conAngulos ? conAngulos[2] : bruto).trim();
  const delSecreto = conAngulos ? conAngulos[1].replace(/^"|"$/g, "").trim() : "";
  const final = (nombre ?? "").trim() || delSecreto || "Vigi";

  return `${JSON.stringify(final)} <${direccion}>`;
};

/**
 * Manda un lote por un proveedor y devuelve un id por mail.
 *
 * Resend devuelve un id por mail. Unitpost devuelve uno solo para todo el
 * lote: se repite en cada fila, alcanza para buscarlo en su panel.
 */
const enviarLote = async (
  proveedor: Proveedor,
  apiKey: string,
  from: string,
  mails: Array<{ email: string; subject: string; html: string }>
): Promise<Array<string | null>> => {
  const cuerpo = mails.map((m) => ({
    from,
    to: proveedor === "resend" ? [m.email] : m.email,
    subject: m.subject,
    html: m.html,
  }));

  const url =
    proveedor === "unitpost"
      ? "https://www.unitpost.com/api/v1/email/batch"
      : "https://api.resend.com/emails/batch";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(proveedor === "unitpost" ? { emails: cuerpo } : cuerpo),
  });

  const payload = await r.json().catch(() => null);
  if (!r.ok) {
    const detalle = payload?.error?.message ?? payload?.message ?? payload?.error;
    throw new Error(
      typeof detalle === "string"
        ? detalle
        : `${proveedor === "unitpost" ? "Unitpost" : "Resend"} respondió ${r.status}`
    );
  }

  if (proveedor === "unitpost") {
    const id = payload?.data?.id ?? null;
    return mails.map(() => id);
  }

  const ids = (payload?.data ?? []) as Array<{ id: string }>;
  return mails.map((_, n) => ids[n]?.id ?? null);
};

/**
 * Cuántos mails de marketing salieron por un proveedor desde `desde`.
 *
 * Lee `email_quota_sends`, que junta campañas y recupero de carritos. No
 * incluye ni las pruebas ni los transaccionales de la API: para eso están el
 * colchón de Unitpost y la reserva de Resend.
 */
const enviadosDesde = async (db: SupabaseClient, proveedor: Proveedor, desde: Date) => {
  const { count, error } = await db
    .from("email_quota_sends")
    .select("provider", { count: "exact", head: true })
    .eq("provider", proveedor)
    .gte("created_at", desde.toISOString());

  // Sin poder contar no se sabe cuánto queda: mejor no mandar que pasarse.
  if (error) throw new Error(`No se pudo leer la cuota: ${error.message}`);

  return count ?? 0;
};

/**
 * Lo que le queda hoy a cada proveedor.
 *
 * Los días y los meses se cuentan en UTC, que es cuando los proveedores
 * reinician la cuenta. Un proveedor sin API key tiene cero.
 */
const cupo = async (db: SupabaseClient, claves: Record<Proveedor, string>) => {
  const medianoche = new Date();
  medianoche.setUTCHours(0, 0, 0, 0);
  const inicioMes = new Date(Date.UTC(medianoche.getUTCFullYear(), medianoche.getUTCMonth(), 1));

  const [uniHoy, uniMes, resHoy] = await Promise.all([
    enviadosDesde(db, "unitpost", medianoche),
    enviadosDesde(db, "unitpost", inicioMes),
    enviadosDesde(db, "resend", medianoche),
  ]);

  const unitpost = claves.unitpost
    ? Math.max(
        0,
        Math.min(UNITPOST_DIARIO - UNITPOST_COLCHON - uniHoy, UNITPOST_MENSUAL - UNITPOST_COLCHON - uniMes)
      )
    : 0;
  const resend = claves.resend ? Math.max(0, RESEND_DIARIO - RESEND_RESERVA - resHoy) : 0;

  return {
    hoy: uniHoy + resHoy,
    disponible: { unitpost, resend } as Record<Proveedor, number>,
    detalle: {
      unitpost: { hoy: uniHoy, mes: uniMes, limite_dia: UNITPOST_DIARIO, limite_mes: UNITPOST_MENSUAL },
      resend: { hoy: resHoy, limite_dia: RESEND_DIARIO - RESEND_RESERVA },
    },
  };
};
// --- fin del bloque compartido ---------------------------------------------


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const env = (k: string) => Deno.env.get(k) ?? "";

// ---------------------------------------------------------------------------
// Datos de la tienda
// ---------------------------------------------------------------------------
//
// Los mismos que el pie de las campañas (`vigi-admin/src/lib/emailTemplates.ts`),
// verificados contra `vigi-app/src/services/const.ts` y
// `vigi-api/src/services/shipping.js`. Si cambian allá, se cambian acá.

const CONTACTO = "contacto@vigi.com.ar";
const ENVIO_GRATIS_DESDE = "$450.000";

// Cuántos productos se dibujan. Más que esto es un catálogo, no un recordatorio.
const MAX_ITEMS = 4;

// Lo mínimo que tiene que comprar para usar el cupón, sobre lo que había en el
// carrito. Sin piso, alguien podría sacar el producto con más margen y aplicar
// el porcentaje a lo que queda, que puede no aguantarlo. El 10% de holgura es
// para que una baja de precio no le rompa el cupón.
const PISO_COMPRA = 0.9;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Item = {
  id: string;
  model: string;
  title: string;
  thumbnail: string | null;
  quantity: number;
  unit_price: number;
  price_original: number | null;
};

type Carrito = {
  cart_id: string;
  customer_id: string;
  email: string;
  name: string | null;
  last_name: string | null;
  cart_updated_at: string;
  units: number;
  amount: number;
  cost: number | null;
  items: Item[];
  last_step: number | null;
  next_step: number | null;
  due: boolean;
  unsubscribed: boolean;
  coupon_blocked: boolean;
  margin_before_pct: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
  margin_after_pct: number | null;
};

type Cupon = { code: string; pct: number; vence: Date };

type Settings = {
  is_active: boolean;
  coupon_valid_hours: number;
  daily_limit: number;
};

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
//
// Tablas y estilos inline, como las campañas: Gmail borra el <style> y ningún
// cliente de correo entiende flex ni grid.

const C = {
  primario: "#1e053f",
  tinta: "#241a33",
  suave: "#6b6478",
  linea: "#e7e4ed",
  panel: "#f4f2f8",
  fondo: "#f5f5f7",
  oferta: "#b9711a",
  ofertaSuave: "#fdf3e3",
};

const FUENTE = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const plata = (n: number) =>
  Number(n).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

const fecha = (d: Date) =>
  d.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const conUtm = (url: string, paso: number, content: string) => {
  const p = new URLSearchParams({
    utm_source: "email",
    utm_medium: "email",
    utm_campaign: "carrito_abandonado",
    utm_content: `paso${paso}_${content}`,
  });
  return `${url}${url.includes("?") ? "&" : "?"}${p.toString()}`;
};

const boton = (texto: string, url: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0">
  <tr><td style="border-radius:999px;background:${C.primario}">
    <a href="${esc(url)}" style="display:inline-block;padding:15px 34px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(texto)}</a>
  </td></tr>
</table>`;

const filaItem = (it: Item, sitio: string, paso: number) => {
  const url = conUtm(`${sitio}/product/${encodeURIComponent(it.model)}`, paso, "producto");
  const foto = it.thumbnail
    ? `<img src="${esc(it.thumbnail)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:contain;border-radius:10px;background:${C.panel}">`
    : `<div style="width:72px;height:72px;border-radius:10px;background:${C.panel}"></div>`;
  // Sin precio tachado: el mail muestra solo lo que se paga hoy. Un tachado al
  // lado de cada producto se lee como un descuento del mail, y en los pasos 1
  // y 2 no hay ninguno. El único descuento que muestra este mail es el cupón
  // del paso 3, y va aparte, abajo del total.
  const cantidad =
    it.quantity > 1 ? `${it.quantity} × ${plata(it.unit_price)}` : `Cantidad: 1`;

  return `
<tr>
  <td width="88" style="padding:12px 0;border-bottom:1px solid ${C.linea}">
    <a href="${esc(url)}">${foto}</a>
  </td>
  <td style="padding:12px 0;border-bottom:1px solid ${C.linea};font-family:${FUENTE}">
    <a href="${esc(url)}" style="font-size:14px;font-weight:600;color:${C.tinta};text-decoration:none;line-height:1.4">${esc(it.title)}</a>
    <div style="margin-top:4px;font-size:12px;color:${C.suave}">${cantidad}</div>
  </td>
  <td align="right" style="padding:12px 0;border-bottom:1px solid ${C.linea};font-family:${FUENTE};white-space:nowrap">
    <span style="font-size:15px;font-weight:700;color:${C.tinta}">${plata(it.unit_price * it.quantity)}</span>
  </td>
</tr>`;
};

/**
 * Los productos y el total, con los precios de este momento: salen de
 * `products.effective_price` en la misma consulta que decide el envío, igual
 * que los lee el carrito al cobrar.
 *
 * `descuento` solo en el paso 3: es lo que descuenta el cupón sobre este
 * carrito (el porcentaje, con el tope en pesos que tiene el cupón).
 */
const tablaItems = (k: Carrito, sitio: string, paso: number, descuento: number | null = null) => {
  const visibles = k.items.slice(0, MAX_ITEMS);
  const resto = k.items.length - visibles.length;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
  ${visibles.map((it) => filaItem(it, sitio, paso)).join("")}
  ${
    resto > 0
      ? `<tr><td colspan="3" style="padding:12px 0;font-family:${FUENTE};font-size:13px;color:${C.suave}">Y ${resto} producto${resto === 1 ? "" : "s"} más en tu carrito.</td></tr>`
      : ""
  }
  <tr>
    <td colspan="2" style="padding:16px 0 0;font-family:${FUENTE};font-size:14px;color:${C.suave}">Total de tu carrito</td>
    <td align="right" style="padding:16px 0 0;font-family:${FUENTE};font-size:18px;font-weight:800;color:${C.primario};white-space:nowrap">${plata(k.amount)}</td>
  </tr>
  ${
    descuento
      ? `<tr>
    <td colspan="2" style="padding:8px 0 0;font-family:${FUENTE};font-size:14px;font-weight:700;color:${C.oferta}">Con tu cupón</td>
    <td align="right" style="padding:8px 0 0;font-family:${FUENTE};font-size:18px;font-weight:800;color:${C.oferta};white-space:nowrap">${plata(k.amount - descuento)}</td>
  </tr>`
      : ""
  }
</table>`;
};

// Lo que se gana comprando, no lo que se teme. Todo verificable en la tienda.
const BENEFICIOS: Array<[string, string, string]> = [
  ["🛡️", "Tranquilidad las 24 horas", "Seguí lo que pasa en tu casa o tu negocio desde el celular, estés donde estés."],
  ["✅", "Garantía oficial", "De 6 a 24 meses según la marca. Trabajamos solo con marcas reconocidas."],
  ["🚚", "Sale hoy mismo", `Comprando antes de las 17:00 despachamos en el día. Envío gratis en CABA y a todo el país desde ${ENVIO_GRATIS_DESDE}.`],
  ["🔒", "Pago protegido", "Pagá con tarjeta de crédito o débito en un checkout seguro."],
];

const bloqueBeneficios = () => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px">
  ${BENEFICIOS.map(
    ([icono, titulo, texto]) => `
  <tr>
    <td width="44" valign="top" style="padding:10px 0;font-size:22px;line-height:1">${icono}</td>
    <td style="padding:10px 0;font-family:${FUENTE}">
      <div style="font-size:15px;font-weight:700;color:${C.tinta}">${titulo}</div>
      <div style="margin-top:3px;font-size:13px;line-height:1.5;color:${C.suave}">${esc(texto)}</div>
    </td>
  </tr>`
  ).join("")}
</table>`;

const bloqueCupon = (c: Cupon) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px">
  <tr><td align="center" style="padding:26px 20px;border:2px dashed ${C.oferta};border-radius:16px;background:${C.ofertaSuave};font-family:${FUENTE}">
    <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.oferta}">Tu código personal</div>
    <div style="margin-top:10px;font-size:30px;font-weight:800;letter-spacing:.12em;color:${C.primario}">${esc(c.code)}</div>
    <div style="margin-top:10px;font-size:16px;font-weight:700;color:${C.tinta}">${c.pct}% OFF en tu carrito</div>
    <div style="margin-top:6px;font-size:12px;color:${C.suave}">Válido hasta el ${esc(fecha(c.vence))} · Es solo para tu cuenta y se usa una vez.</div>
  </td></tr>
</table>`;

const marco = (opts: {
  sitio: string;
  preheader: string;
  cuerpo: string;
  baja: string;
}) => `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VIGI</title></head>
<body style="margin:0;padding:0;background:${C.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo}">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
      <tr><td align="center" style="background:${C.primario};padding:22px">
        <a href="${esc(opts.sitio)}"><img src="${esc(opts.sitio)}/2.png" height="34" alt="VIGI" style="display:block;height:34px;border:0"></a>
      </td></tr>
      <tr><td style="padding:34px 32px 36px">${opts.cuerpo}</td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.linea};font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.suave};text-align:center">
        ¿Dudas con tu compra? Escribinos a <a href="mailto:${CONTACTO}" style="color:${C.suave}">${CONTACTO}</a> y te asesoramos.<br>
        Recibís este mail porque dejaste productos en tu carrito de VIGI.
        <a href="${esc(opts.baja)}" style="color:${C.suave};text-decoration:underline">Darme de baja</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

const titulo = (t: string) =>
  `<h1 style="margin:0;font-family:${FUENTE};font-size:26px;line-height:1.25;font-weight:800;color:${C.primario}">${t}</h1>`;

const parrafo = (t: string) =>
  `<p style="margin:14px 0 0;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${C.tinta}">${t}</p>`;

/** Asunto y HTML de un paso. `cupon` solo en el paso 3. */
const armarMail = (
  paso: number,
  k: Carrito,
  sitio: string,
  baja: string,
  cupon: Cupon | null
): { subject: string; html: string } => {
  const nombre = (k.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hola = nombre ? `Hola ${esc(nombre)},` : "Hola,";
  const carrito = conUtm(`${sitio}/cart`, paso, "boton");

  if (paso === 1) {
    return {
      subject: nombre ? `${nombre}, tu carrito te está esperando` : "Tu carrito te está esperando",
      html: marco({
        sitio,
        baja,
        preheader: "Guardamos tus productos para que termines tu compra cuando quieras.",
        cuerpo:
          titulo("Tu carrito sigue acá") +
          parrafo(
            `${hola} vimos que dejaste algunos productos en tu carrito. Los guardamos para que puedas terminar tu compra cuando quieras.`
          ) +
          tablaItems(k, sitio, paso) +
          boton("Volver a mi carrito", carrito),
      }),
    };
  }

  if (paso === 2) {
    return {
      subject: "Tu casa más segura, a un clic",
      html: marco({
        sitio,
        baja,
        preheader: "Garantía oficial, despacho en el día y pago protegido.",
        cuerpo:
          titulo("Protegé lo que más te importa") +
          parrafo(
            `${hola} lo que elegiste no es un producto más: es la tranquilidad de saber que tu casa, tu familia o tu negocio están cuidados.`
          ) +
          bloqueBeneficios() +
          tablaItems(k, sitio, paso) +
          boton("Terminar mi compra", carrito),
      }),
    };
  }

  if (!cupon) throw new Error("El paso 3 necesita un cupón");

  // Lo mismo que va a descontar el carrito: el porcentaje sobre el total, con
  // el tope en pesos del cupón (que es el descuento cotizado para este carrito).
  const porPorcentaje = Math.round((k.amount * cupon.pct) / 100);
  const descuento =
    k.discount_amount != null ? Math.min(porPorcentaje, Number(k.discount_amount)) : porPorcentaje;

  return {
    subject: nombre
      ? `${nombre}, te guardamos un ${cupon.pct}% OFF`
      : `Te guardamos un ${cupon.pct}% OFF para tu carrito`,
    html: marco({
      sitio,
      baja,
      preheader: `Un descuento personal para que termines tu compra. Vence el ${fecha(cupon.vence)}.`,
      cuerpo:
        titulo("Un regalo para que termines de protegerte") +
        parrafo(
          `${hola} queremos que te lleves lo que elegiste. Por eso te dejamos un descuento exclusivo para tu carrito: ingresá el código en el carrito antes de pagar.`
        ) +
        bloqueCupon(cupon) +
        tablaItems(k, sitio, paso, descuento) +
        boton("Usar mi descuento", carrito),
    }),
  };
};

// ---------------------------------------------------------------------------
// Cupón
// ---------------------------------------------------------------------------

// Sin 0/O ni 1/I/L: el cliente lo tipea mirando el celular.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const codigo = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "VUELVE-" + Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // --- Quién llama --------------------------------------------------------
  const secreto = env("CART_RECOVERY_SECRET");
  const esCron = Boolean(secreto) && req.headers.get("x-cron-secret") === secreto;

  if (!esCron) {
    // El panel: con el token del usuario, para que admin_users pase por RLS.
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization) return json({ error: "Falta el token" }, 401);

    const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });

    const { data: admin } = await supabase.from("admin_users").select("email").maybeSingle();
    if (!admin) return json({ error: "No autorizado" }, 403);
  }

  let body: { action?: string; step?: number; email?: string } = {};
  try {
    body = await req.json();
  } catch {
    // El cron puede llamar sin body: es una corrida normal.
  }

  const accion = esCron ? "run" : String(body.action ?? "run");

  const claves: Record<Proveedor, string> = {
    unitpost: env("UNITPOST_API_KEY"),
    resend: env("RESEND_API_KEY"),
  };
  const from = env("MARKETING_FROM");
  const fromResend = env("RESEND_MARKETING_FROM") || from;
  const sitio = env("CLIENT_URL").replace(/\/+$/, "");

  if (!from || !sitio || (!claves.unitpost && !claves.resend)) {
    return json(
      { error: "Faltan MARKETING_FROM, CLIENT_URL y al menos una de UNITPOST_API_KEY o RESEND_API_KEY" },
      500
    );
  }

  const de: Record<Proveedor, string> = {
    unitpost: remitente(from, "Vigi"),
    resend: remitente(fromResend, "Vigi"),
  };

  // service_role: los carritos, los cupones y los envíos no se escriben (ni
  // se leen, los carritos) desde el panel.
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: ajustes, error: errAjustes } = await db
    .from("cart_recovery_settings")
    .select("is_active, coupon_valid_hours, daily_limit")
    .maybeSingle();
  if (errAjustes || !ajustes) {
    return json({ error: errAjustes?.message ?? "Falta la configuración (migración 0021)" }, 500);
  }
  const s = ajustes as Settings;

  const { data: filas, error: errCarritos } = await db.rpc("cart_recovery_open_carts");
  if (errCarritos) return json({ error: errCarritos.message }, 500);
  const carritos = (filas ?? []) as Carrito[];

  // --- Vista previa y prueba ----------------------------------------------
  // Con un carrito real si hay alguno abierto (el más caro, que es el que más
  // muestra), o con uno de ejemplo. No crean cupones ni dejan filas.
  if (accion === "preview" || accion === "test") {
    const paso = [1, 2, 3].includes(Number(body.step)) ? Number(body.step) : 1;

    const muestra: Carrito =
      [...carritos].sort((a, b) => b.amount - a.amount)[0] ??
      ({
        cart_id: "",
        customer_id: "",
        email: "",
        name: "Juan",
        last_name: "",
        cart_updated_at: new Date().toISOString(),
        units: 1,
        amount: 189990,
        cost: null,
        items: [
          {
            id: "",
            model: "",
            title: "Kit de 4 cámaras Wi-Fi para exterior",
            thumbnail: null,
            quantity: 1,
            unit_price: 189990,
            price_original: null,
          },
        ],
      } as unknown as Carrito);

    const pct = muestra.discount_pct ?? 8;
    const cuponDemo: Cupon = {
      code: "VUELVE-EJEMPLO",
      pct,
      vence: new Date(Date.now() + s.coupon_valid_hours * 3600_000),
    };

    const mail = armarMail(paso, muestra, sitio, `${sitio}/baja?token=prueba`, paso === 3 ? cuponDemo : null);

    if (accion === "preview") return json({ ok: true, step: paso, ...mail });

    const destino = String(body.email ?? "").trim();
    if (!destino) return json({ error: "Falta el email de prueba" }, 400);

    const proveedor: Proveedor = claves.unitpost ? "unitpost" : "resend";
    try {
      await enviarLote(proveedor, claves[proveedor], de[proveedor], [
        { email: destino, subject: `[Prueba] ${mail.subject}`, html: mail.html },
      ]);
      return json({ ok: true, test: true, step: paso, provider: proveedor });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  if (accion !== "run") return json({ error: `Acción desconocida: ${accion}` }, 400);

  // --- Corrida ------------------------------------------------------------
  if (!s.is_active) {
    return json({ ok: true, active: false, sent: 0, message: "El recupero de carritos está apagado." });
  }

  // Los más caros primero: si la cuota no alcanza, que se quede afuera el
  // carrito de $20.000 y no el kit de $900.000.
  const pendientes = carritos.filter((k) => k.due).sort((a, b) => b.amount - a.amount);

  if (pendientes.length === 0) {
    return json({ ok: true, sent: 0, message: "No hay carritos con mails pendientes." });
  }

  const medianoche = new Date();
  medianoche.setUTCHours(0, 0, 0, 0);

  const { count: hoyRecupero } = await db
    .from("cart_recovery_sends")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", medianoche.toISOString());

  let cuota: Awaited<ReturnType<typeof cupo>>;
  try {
    cuota = await cupo(db, claves);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  const disponible = { ...cuota.disponible };
  let restanHoy = Math.max(0, s.daily_limit - (hoyRecupero ?? 0));

  const resultado = { sent: 0, failed: 0, skipped: 0, deferred: 0, detalle: [] as string[] };

  for (const k of pendientes) {
    const paso = k.next_step as number;

    const base = {
      cart_id: k.cart_id,
      customer_id: k.customer_id,
      email: k.email,
      step: paso,
      cart_updated_at: k.cart_updated_at,
      cart_amount: k.amount,
      cart_cost: k.cost,
      margin_before_pct: k.margin_before_pct,
    };

    // Los saltos se registran sin gastar cuota: cierran el paso para que no
    // se vuelva a evaluar cada hora.
    if (paso === 3 && (k.coupon_blocked || k.discount_pct == null)) {
      const motivo = k.coupon_blocked
        ? "Ya recibió un cupón de recupero hace poco"
        : k.cost == null
        ? "Hay productos sin costo cargado: no se puede calcular el descuento"
        : "El margen del carrito no aguanta el descuento mínimo";

      const { error } = await db.from("cart_recovery_sends").insert({ ...base, status: "skipped", error: motivo });
      if (!error) resultado.skipped++;
      continue;
    }

    const proveedor: Proveedor | null =
      disponible.unitpost > 0 ? "unitpost" : disponible.resend > 0 ? "resend" : null;

    if (!proveedor || restanHoy <= 0) {
      // Quedan para la próxima corrida, sin fila: no se cierra el paso.
      resultado.deferred++;
      continue;
    }

    // Reserva: la fila se escribe antes de mandar. Si otra corrida ya la
    // escribió, la unique la rechaza y este mail no sale dos veces.
    const { data: reserva, error: errReserva } = await db
      .from("cart_recovery_sends")
      .insert({ ...base, status: "pending" })
      .select("id")
      .single();

    if (errReserva || !reserva) continue;

    // Contacto para el link de baja. Si no estaba en la lista, entra como
    // 'customer', igual que cuando se importan los clientes desde el panel.
    await db
      .from("marketing_contacts")
      .upsert(
        { email: k.email, name: [k.name, k.last_name].filter(Boolean).join(" ") || null, source: "customer" },
        { onConflict: "email", ignoreDuplicates: true }
      );

    const { data: contacto } = await db
      .from("marketing_contacts")
      .select("unsubscribe_token, is_subscribed")
      .eq("email", k.email)
      .maybeSingle();

    if (!contacto?.unsubscribe_token || contacto.is_subscribed === false) {
      await db
        .from("cart_recovery_sends")
        .update({ status: "skipped", error: "Dado de baja de los mails" })
        .eq("id", reserva.id);
      resultado.skipped++;
      continue;
    }

    // --- Cupón (paso 3) ---
    let cupon: Cupon | null = null;
    let couponId: string | null = null;

    if (paso === 3) {
      const pct = Number(k.discount_pct);
      const vence = new Date(Date.now() + s.coupon_valid_hours * 3600_000);

      for (let intento = 0; intento < 3 && !couponId; intento++) {
        const code = codigo();
        const { data: creado, error } = await db
          .from("coupons")
          .insert({
            code,
            description: `Recupero de carrito · ${pct}% · margen ${k.margin_before_pct}% → ${k.margin_after_pct}%`,
            kind: "percentage",
            value: pct,
            // El tope es el descuento calculado sobre este carrito: si agrega
            // productos, el cupón no crece más allá de lo que se cotizó.
            max_discount: k.discount_amount,
            min_purchase: Math.floor((k.amount * PISO_COMPRA) / 1000) * 1000,
            max_redemptions: 1,
            max_per_customer: 1,
            starts_at: new Date().toISOString(),
            ends_at: vence.toISOString(),
            is_active: true,
            customer_id: k.customer_id,
            origin: "cart_recovery",
          })
          .select("id")
          .single();

        if (creado) {
          couponId = creado.id;
          cupon = { code, pct, vence };
        } else if (error && error.code !== "23505") {
          // Cualquier cosa que no sea un código repetido no se arregla
          // reintentando.
          break;
        }
      }

      if (!cupon) {
        await db
          .from("cart_recovery_sends")
          .update({ status: "failed", error: "No se pudo crear el cupón" })
          .eq("id", reserva.id);
        resultado.failed++;
        continue;
      }
    }

    const baja = `${sitio}/baja?token=${contacto.unsubscribe_token}`;
    const mail = armarMail(paso, k, sitio, baja, cupon);

    try {
      const [providerId] = await enviarLote(proveedor, claves[proveedor], de[proveedor], [
        { email: k.email, subject: mail.subject, html: mail.html },
      ]);

      await db
        .from("cart_recovery_sends")
        .update({
          status: "sent",
          provider: proveedor,
          provider_id: providerId,
          coupon_id: couponId,
          discount_pct: cupon?.pct ?? null,
          discount_amount: cupon ? k.discount_amount : null,
          margin_after_pct: cupon ? k.margin_after_pct : null,
          created_at: new Date().toISOString(),
        })
        .eq("id", reserva.id);

      disponible[proveedor]--;
      restanHoy--;
      resultado.sent++;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);

      // Un cupón que nadie recibió no tiene que quedar vivo.
      if (couponId) await db.from("coupons").delete().eq("id", couponId);

      await db
        .from("cart_recovery_sends")
        .update({ status: "failed", provider: proveedor, error: mensaje.slice(0, 500) })
        .eq("id", reserva.id);

      resultado.failed++;
      resultado.detalle.push(`${k.email}: ${mensaje}`);
    }
  }

  return json({
    ok: true,
    ...resultado,
    message:
      `Salieron ${resultado.sent}` +
      (resultado.failed ? `, fallaron ${resultado.failed}` : "") +
      (resultado.skipped ? `, ${resultado.skipped} sin mail (sin margen, baja o cupón reciente)` : "") +
      (resultado.deferred ? `, ${resultado.deferred} quedan para la próxima corrida por cuota` : "") +
      ".",
  });
});
