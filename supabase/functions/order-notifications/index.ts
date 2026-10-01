// Cambio de estado de un pedido, con el mail al cliente.
//
// La llama el panel desde el modal de confirmación del detalle de la orden
// (migraciones 0024 y 0025), con el token del admin:
//
//   { action: "change_status", order_id, status, notify }
//       cambia el estado y, si `notify` y el estado tiene mail, lo manda en
//       el momento. El mail queda en `order_notifications`.
//   { action: "preview", order_id?, status }
//       devuelve { subject, html } sin mandar nada (el "Ver el mail" del modal).
//   { action: "test", order_id?, status, email }
//       lo manda a esa dirección, con [Prueba] en el asunto.
//
// Sale por Resend, como la confirmación de compra de vigi-api: es
// transaccional y usa la reserva diaria que el marketing le deja libre.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const env = (k: string) => Deno.env.get(k) ?? "";

// ---------------------------------------------------------------------------
// Datos de la tienda
// ---------------------------------------------------------------------------
//
// Los mismos que la web (vigi-app: preguntas frecuentes, /legales/envios y
// /legales/devoluciones). Si cambian allá, se cambian acá.

const CONTACTO = "contacto@vigi.com.ar";
const WHATSAPP = "https://wa.me/541126039243";

type Estado = "enviado" | "entregado" | "cancelado" | "reembolsado";
const ESTADOS: Estado[] = ["enviado", "entregado", "cancelado", "reembolsado"];

type Item = { name: string; quantity: number; unit_price: number; model: string | null; thumbnail: string | null };

type Pedido = {
  id: string;
  payment_id: string;
  status: string;
  amount_paid: number;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  email: string;
  name: string | null;
  items: Item[];
};

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
//
// El mismo diseño que el recupero de carritos (cart-recovery): tablas y
// estilos inline, porque Gmail borra el <style> y ningún cliente de correo
// entiende flex ni grid.

const C = {
  primario: "#1e053f",
  tinta: "#241a33",
  suave: "#6b6478",
  linea: "#e7e4ed",
  panel: "#f4f2f8",
  fondo: "#f5f5f7",
  verde: "#1f8f45",
  verdeSuave: "#e9f7ee",
};

const FUENTE = "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

const esc = (s: string) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const plata = (n: number) =>
  Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

const conUtm = (url: string, estado: Estado, content: string) => {
  const p = new URLSearchParams({
    utm_source: "email",
    utm_medium: "email",
    utm_campaign: "estado_pedido",
    utm_content: `${estado}_${content}`,
  });
  return `${url}${url.includes("?") ? "&" : "?"}${p.toString()}`;
};

const boton = (texto: string, url: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0">
  <tr><td style="border-radius:999px;background:${C.primario}">
    <a href="${esc(url)}" style="display:inline-block;padding:15px 34px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">${esc(texto)}</a>
  </td></tr>
</table>`;

const titulo = (t: string) =>
  `<h1 style="margin:0;font-family:${FUENTE};font-size:26px;line-height:1.25;font-weight:800;color:${C.primario}">${t}</h1>`;

const parrafo = (t: string) =>
  `<p style="margin:14px 0 0;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${C.tinta}">${t}</p>`;

const subtitulo = (t: string) =>
  `<p style="margin:28px 0 0;font-family:${FUENTE};font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.suave}">${t}</p>`;

const lista = (filas: string[]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px">
  ${filas
    .map(
      (f) => `<tr>
    <td width="22" valign="top" style="padding:5px 0;font-family:${FUENTE};font-size:15px;color:${C.verde}">✓</td>
    <td style="padding:5px 0;font-family:${FUENTE};font-size:14px;line-height:1.55;color:${C.tinta}">${f}</td>
  </tr>`
    )
    .join("")}
</table>`;

const recuadro = (contenido: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
  <tr><td style="padding:20px 22px;border-radius:16px;background:${C.panel};font-family:${FUENTE}">${contenido}</td></tr>
</table>`;

/** Datos del envío: empresa, número y, si hay, el botón para seguirlo. */
const bloqueSeguimiento = (p: Pedido) => {
  if (!p.tracking_number && !p.carrier) return "";
  const fila = (k: string, v: string) =>
    `<div style="margin-top:6px;font-size:14px;color:${C.tinta}"><span style="color:${C.suave}">${k}:</span> <strong>${esc(v)}</strong></div>`;
  return recuadro(
    `<div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${C.suave}">Seguimiento</div>` +
      (p.carrier ? fila("Empresa", p.carrier) : "") +
      (p.tracking_number ? fila("Número", p.tracking_number) : "")
  );
};

const tablaItems = (p: Pedido, sitio: string, estado: Estado) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px">
  ${p.items
    .map((it) => {
      const url = it.model ? conUtm(`${sitio}/product/${encodeURIComponent(it.model)}`, estado, "producto") : null;
      const foto = it.thumbnail
        ? `<img src="${esc(it.thumbnail)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:contain;border-radius:10px;background:${C.panel}">`
        : `<div style="width:56px;height:56px;border-radius:10px;background:${C.panel}"></div>`;
      const nombre = url
        ? `<a href="${esc(url)}" style="font-size:14px;font-weight:600;color:${C.tinta};text-decoration:none;line-height:1.4">${esc(it.name)}</a>`
        : `<span style="font-size:14px;font-weight:600;color:${C.tinta};line-height:1.4">${esc(it.name)}</span>`;
      return `<tr>
    <td width="70" style="padding:10px 0;border-bottom:1px solid ${C.linea}">${foto}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${C.linea};font-family:${FUENTE}">
      ${nombre}
      <div style="margin-top:3px;font-size:12px;color:${C.suave}">Cantidad: ${it.quantity}</div>
    </td>
  </tr>`;
    })
    .join("")}
</table>`;

const marco = (sitio: string, preheader: string, cuerpo: string) => `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VIGI</title></head>
<body style="margin:0;padding:0;background:${C.fondo}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.fondo}">
  <tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden">
      <tr><td align="center" style="background:${C.primario};padding:22px">
        <a href="${esc(sitio)}"><img src="${esc(sitio)}/2.png" height="34" alt="VIGI" style="display:block;height:34px;border:0"></a>
      </td></tr>
      <tr><td style="padding:34px 32px 36px">${cuerpo}</td></tr>
      <tr><td style="padding:20px 32px 28px;border-top:1px solid ${C.linea};font-family:${FUENTE};font-size:12px;line-height:1.6;color:${C.suave};text-align:center">
        ¿Dudas con tu pedido? Escribinos a <a href="mailto:${CONTACTO}" style="color:${C.suave}">${CONTACTO}</a>
        o por <a href="${esc(WHATSAPP)}" style="color:${C.suave}">WhatsApp</a>.<br>
        Recibís este mail porque hiciste una compra en VIGI.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

/** Asunto y HTML del mail de un estado. */
const armarMail = (estado: Estado, p: Pedido, sitio: string): { subject: string; html: string } => {
  const nombre = (p.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hola = nombre ? `Hola ${esc(nombre)},` : "Hola,";
  const pedido = `<strong>N° ${esc(p.payment_id)}</strong>`;
  const misPedidos = conUtm(`${sitio}/profile`, estado, "boton");
  const whatsappPedido = `${WHATSAPP}?text=${encodeURIComponent(`Hola! Consulto por mi pedido ${p.payment_id}`)}`;

  if (estado === "enviado") {
    const seguir = p.tracking_url ? boton("Seguir mi envío", p.tracking_url) : boton("Ver mi pedido", misPedidos);
    return {
      subject: `Tu pedido está en camino 🚚 | VIGI`,
      html: marco(
        sitio,
        "Ya despachamos tu pedido. Acá tenés los datos para seguirlo.",
        titulo("¡Tu pedido está en camino!") +
          parrafo(`${hola} ya despachamos tu pedido ${pedido}.`) +
          bloqueSeguimiento(p) +
          seguir +
          subtitulo("Cuándo llega") +
          lista([
            "<strong>CABA:</strong> en 24 h hábiles.",
            "<strong>Resto del AMBA:</strong> en un máximo de 4 días hábiles.",
            "<strong>Resto del país:</strong> de 8 a 12 días hábiles desde la compra.",
          ]) +
          subtitulo("Al recibirlo") +
          lista([
            "Tené el DNI a mano.",
            "Revisá que el paquete esté en buen estado y que el pedido coincida antes de firmar el remito.",
          ]) +
          subtitulo("Tu pedido") +
          tablaItems(p, sitio, estado)
      ),
    };
  }

  if (estado === "entregado") {
    return {
      subject: `¡Tu pedido llegó! | VIGI`,
      html: marco(
        sitio,
        "Gracias por comprar en VIGI. Te dejamos la garantía a mano.",
        titulo("¡Tu pedido llegó! 🎉") +
          parrafo(`${hola} tu pedido ${pedido} ya figura como entregado. ¡Gracias por elegirnos!`) +
          tablaItems(p, sitio, estado) +
          subtitulo("Tu garantía") +
          lista([
            "Si algo llegó fallado o dañado, avisanos <strong>dentro de los 5 días corridos</strong> y te lo cambiamos o te devolvemos el dinero.",
            "Después, rige la garantía del fabricante, de 6 meses a 2 años según la marca, y te ayudamos a gestionarla.",
          ]) +
          parrafo(
            `¿Algo no anda o tenés dudas con la instalación? <a href="${esc(whatsappPedido)}" style="color:${C.primario};font-weight:700">Escribinos por WhatsApp</a> y te ayudamos.`
          ) +
          boton("Ver mi pedido", misPedidos)
      ),
    };
  }

  if (estado === "cancelado") {
    return {
      subject: `Cancelamos tu pedido N° ${p.payment_id} | VIGI`,
      html: marco(
        sitio,
        "Tu pedido fue cancelado.",
        titulo("Tu pedido fue cancelado") +
          parrafo(`${hola} cancelamos tu pedido ${pedido}.`) +
          parrafo("Si el pago ya se había acreditado, te vamos a avisar por mail cuando procesemos la devolución.") +
          parrafo(
            `Si no pediste la cancelación o tenés alguna duda, <a href="${esc(whatsappPedido)}" style="color:${C.primario};font-weight:700">escribinos por WhatsApp</a> o a ${CONTACTO}.`
          ) +
          subtitulo("Lo que tenía el pedido") +
          tablaItems(p, sitio, estado)
      ),
    };
  }

  // reembolsado
  return {
    subject: `Te devolvimos el dinero de tu pedido | VIGI`,
    html: marco(
      sitio,
      `Reintegramos ${plata(p.amount_paid)} de tu pedido N° ${p.payment_id}.`,
      titulo("Te devolvimos el dinero") +
        parrafo(`${hola} reintegramos <strong>${plata(p.amount_paid)}</strong> de tu pedido ${pedido}.`) +
        parrafo(
          "La devolución se hace al mismo medio con el que pagaste. Según tu banco o tarjeta, puede tardar algunos días hábiles en verse reflejada."
        ) +
        parrafo(
          `Si pasado ese tiempo no la ves, <a href="${esc(whatsappPedido)}" style="color:${C.primario};font-weight:700">escribinos por WhatsApp</a> o a ${CONTACTO}.`
        )
    ),
  };
};

// ---------------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------------

const traerPedido = async (db: SupabaseClient, orderId: string): Promise<Pedido | null> => {
  const { data, error } = await db
    .from("orders")
    .select(
      "id, payment_id, status, amount_paid, carrier, tracking_number, tracking_url, " +
        "customers(email, name), order_items(name, quantity, unit_price, products(model, thumbnail))"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const d = data as any;
  return {
    id: d.id,
    payment_id: String(d.payment_id),
    status: d.status,
    amount_paid: Number(d.amount_paid),
    carrier: d.carrier,
    tracking_number: d.tracking_number,
    tracking_url: d.tracking_url,
    email: d.customers?.email ?? "",
    name: d.customers?.name ?? null,
    items: (d.order_items ?? []).map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      unit_price: Number(i.unit_price),
      model: i.products?.model ?? null,
      thumbnail: i.products?.thumbnail ?? null,
    })),
  };
};

/** Un pedido de ejemplo para la vista previa, si no hay ninguno real. */
const ejemplo = (estado: Estado): Pedido => ({
  id: "",
  payment_id: "123456789",
  status: estado,
  amount_paid: 189990,
  carrier: "Andreani",
  tracking_number: "360002412345678",
  tracking_url: "https://www.andreani.com/",
  email: "",
  name: "Juan",
  items: [{ name: "Kit de 4 cámaras Wi-Fi para exterior", quantity: 1, unit_price: 189990, model: null, thumbnail: null }],
});

const enviar = async (apiKey: string, from: string, to: string, mail: { subject: string; html: string }) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: CONTACTO, subject: mail.subject, html: mail.html }),
  });
  const payload = await r.json().catch(() => null);
  if (!r.ok) {
    const detalle = payload?.message ?? payload?.error?.message ?? payload?.error;
    throw new Error(typeof detalle === "string" ? detalle : `Resend respondió ${r.status}`);
  }
  return (payload?.id as string | undefined) ?? null;
};

// ---------------------------------------------------------------------------


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // --- Quién llama: solo un admin -----------------------------------------
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: "Falta el token" }, 401);
  const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: admin } = await caller.from("admin_users").select("email").maybeSingle();
  if (!admin) return json({ error: "No autorizado" }, 403);

  const body: { action?: string; status?: string; email?: string; order_id?: string; notify?: boolean } =
    await req.json().catch(() => ({}));
  const accion = String(body.action ?? "");

  const apiKey = env("RESEND_API_KEY");
  const from = env("ORDER_EMAIL_FROM");
  const sitio = env("CLIENT_URL").replace(/\/+$/, "");

  // service_role: el estado, los clientes y el registro de mails no se
  // escriben (ni se leen, los mails) con el token del panel.
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  try {
    // --- Cambiar el estado ------------------------------------------------
    if (accion === "change_status") {
      const orderId = String(body.order_id ?? "");
      const status = String(body.status ?? "");
      if (!orderId || !status) return json({ error: "Faltan order_id o status" }, 400);

      const { data: actual, error: errOrden } = await db
        .from("orders")
        .update({ status })
        .eq("id", orderId)
        .select("id")
        .maybeSingle();
      if (errOrden) return json({ error: errOrden.message }, 400);
      if (!actual) return json({ error: "No existe la orden" }, 404);

      const conMail = body.notify === true && (ESTADOS as string[]).includes(status);
      if (!conMail) return json({ ok: true, mail: null });

      // Desde acá el estado ya cambió: si el mail falla, se avisa pero no se
      // vuelve atrás. Queda registrado y se puede reenviar desde el panel.
      const p = await traerPedido(db, orderId);
      if (!p?.email) return json({ ok: true, mail: { ok: false, error: "El cliente no tiene email" } });

      if (!apiKey || !from || !sitio) {
        return json({ ok: true, mail: { ok: false, error: "Faltan RESEND_API_KEY, ORDER_EMAIL_FROM o CLIENT_URL" } });
      }

      let id: string | null = null;
      let error: string | null = null;
      try {
        id = await enviar(apiKey, from, p.email, armarMail(status as Estado, p, sitio));
      } catch (e) {
        error = (e as Error).message;
      }

      await db.from("order_notifications").insert({
        order_id: orderId,
        status,
        email: p.email,
        provider_message_id: id,
        error,
        sent_by: admin.email,
      });

      return json({ ok: true, mail: error ? { ok: false, error } : { ok: true, email: p.email } });
    }

    // --- Vista previa y prueba --------------------------------------------
    if (accion === "preview" || accion === "test") {
      if (!sitio) return json({ error: "Falta CLIENT_URL" }, 500);
      const estado = (ESTADOS as string[]).includes(String(body.status)) ? (body.status as Estado) : "enviado";
      const real = body.order_id ? await traerPedido(db, body.order_id) : null;
      const mail = armarMail(estado, real ?? ejemplo(estado), sitio);

      if (accion === "preview") return json(mail);

      if (!apiKey || !from) return json({ error: "Faltan RESEND_API_KEY u ORDER_EMAIL_FROM" }, 500);
      const destino = String(body.email ?? "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) return json({ error: "Email de prueba inválido" }, 400);
      const id = await enviar(apiKey, from, destino, { ...mail, subject: `[Prueba] ${mail.subject}` });
      return json({ ok: true, id });
    }

    return json({ error: `Acción desconocida: ${accion}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
