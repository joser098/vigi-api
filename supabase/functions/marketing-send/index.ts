// Envío de una campaña de email marketing.
//
// Corre en servidor por el mismo motivo que product-images y meli-price: la
// API key de Resend no puede estar en el bundle del panel. El panel arma la
// campaña y aprieta el botón; acá se decide a quién se le manda y se manda.
//
// Desplegar:
//   npx supabase functions deploy marketing-send --project-ref <REF>
//   npx supabase secrets set RESEND_API_KEY=... MARKETING_FROM=... CLIENT_URL=...
//
// MARKETING_FROM es la dirección remitente, con dominio verificado en Resend.
// Puede ir sola ("marketing@notification.vigi.com.ar") o con nombre
// ("Vigi <marketing@notification.vigi.com.ar>"): el nombre para mostrar lo
// arma `remitente()` más abajo. CLIENT_URL es el sitio público, para armar el
// link de baja.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Resend acepta hasta 100 mails por llamada al endpoint batch.
const LOTE = 100;

// Cuota diaria del plan gratuito de Resend. La comparten el marketing y los
// mails transaccionales de vigi-api, que salen con la misma API key: si una
// campaña se come los 100, las confirmaciones de compra del día no salen.
const LIMITE_DIARIO = 100;

// Cuántos manda una tanda si el panel no pide otra cosa. Los 15 que quedan
// son el colchón para lo transaccional y para las pruebas, que también
// descuentan de la cuota y no quedan registradas en marketing_sends.
const TANDA_POR_DEFECTO = 85;

// Freno de mano. Una lista más grande que esto es casi siempre un error de
// carga, y del otro lado hay gente real: mejor que falle a que salga.
const MAXIMO_DESTINATARIOS = 5000;

// PostgREST corta en 1000 filas por respuesta, y no avisa. Con más de mil
// contactos eso serían dos cosas silenciosas y feas: no mandarle nunca a la
// cola de la lista, y —peor— leer una lista incompleta de "ya enviados" y
// escribirle dos veces a la misma gente. Por eso todo lo que puede pasar de
// mil filas se pide por páginas.
const PAGINA = 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // invoke() de supabase-js agrega apikey y x-client-info: si no están acá, el
  // preflight falla y el navegador lo reporta como error de CORS.
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const env = (k: string) => Deno.env.get(k) ?? "";

type Contacto = { id: string; email: string; name: string | null; unsubscribe_token: string };

/**
 * Trae una tabla entera, de a mil filas.
 *
 * `armar` devuelve la consulta ya filtrada para ese tramo; acá solo se repite
 * hasta que una página vuelve corta.
 */
const traerTodo = async <T>(
  armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> => {
  const filas: T[] = [];

  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);

    const pagina = (data ?? []) as T[];
    filas.push(...pagina);

    if (pagina.length < PAGINA) return filas;
  }
};

/**
 * El remitente, con nombre para mostrar.
 *
 * Sin nombre, la bandeja de entrada muestra la parte de antes del arroba: un
 * mail de "marketing@notification.vigi.com.ar" llega firmado por
 * **marketing**, que no le dice nada a nadie. Con nombre llega como **Vigi**.
 *
 * El nombre sale de la campaña (`from_name`). Si la campaña no trae, se usa el
 * que ya venga en MARKETING_FROM, y si tampoco, "Vigi". Va entre comillas
 * porque un nombre con coma o con punto sin comillas rompe la cabecera.
 */
const remitente = (bruto: string, nombreCampana: string | null) => {
  const conAngulos = bruto.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);

  const direccion = (conAngulos ? conAngulos[2] : bruto).trim();
  const delSecreto = conAngulos ? conAngulos[1].replace(/^"|"$/g, "").trim() : "";
  const nombre = (nombreCampana ?? "").trim() || delSecreto || "Vigi";

  return `${JSON.stringify(nombre)} <${direccion}>`;
};

/**
 * El link de baja se inyecta en cada mail.
 *
 * Va por contacto y con token propio, no con el email en la query string: una
 * URL con el mail adentro se filtra en logs, en referers y en cualquier
 * proxy del camino.
 *
 * Si el HTML trae el marcador {{unsubscribe}} se reemplaza ahí. Si no, se
 * agrega un pie al final: una campaña sin forma de darse de baja no se manda.
 */
const conBaja = (html: string, url: string) => {
  if (html.includes("{{unsubscribe}}")) return html.replaceAll("{{unsubscribe}}", url);

  return `${html}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e7e4ed;text-align:center;font-family:system-ui,sans-serif;font-size:12px;color:#6b6478">
  Recibís este mail porque estás suscripto a las novedades de VIGI.
  <a href="${url}" style="color:#6b6478;text-decoration:underline">Darme de baja</a>
</div>`;
};

const personalizar = (html: string, c: Contacto) =>
  html.replaceAll("{{name}}", c.name ?? "").replaceAll("{{email}}", c.email);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // --- Autorización -------------------------------------------------------
  // Con el token del usuario, no con service_role: así la consulta a
  // admin_users pasa por RLS y la whitelist sigue siendo la única fuente de
  // verdad, igual que en el resto del panel.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization) return json({ error: "Falta el token" }, 401);

  const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });

  const { data: admin } = await supabase.from("admin_users").select("email").maybeSingle();
  if (!admin) return json({ error: "No autorizado" }, 403);

  // --- Payload ------------------------------------------------------------
  let body: { campaign_id?: string; test_email?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Se esperaba JSON" }, 400);
  }

  const campaignId = String(body.campaign_id ?? "").trim();
  const testEmail = String(body.test_email ?? "").trim();
  if (!campaignId) return json({ error: "Falta campaign_id" }, 400);

  const apiKey = env("RESEND_API_KEY");
  const from = env("MARKETING_FROM");
  if (!apiKey || !from) {
    return json({ error: "Faltan RESEND_API_KEY o MARKETING_FROM en la function" }, 500);
  }

  // service_role para escribir el resultado: marketing_sends y los contadores
  // de la campaña no se pueden escribir desde el panel a propósito.
  const admin_db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: campana, error: errCampana } = await admin_db
    .from("marketing_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (errCampana) return json({ error: errCampana.message }, 500);
  if (!campana) return json({ error: "No existe la campaña" }, 404);
  if (!campana.html?.trim()) return json({ error: "La campaña no tiene contenido" }, 400);

  const de = remitente(from, campana.from_name);

  const enviar = async (destinatarios: Array<{ email: string; html: string }>) => {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        destinatarios.map((d) => ({
          from: de,
          to: [d.email],
          subject: campana.subject,
          html: d.html,
        }))
      ),
    });

    const payload = await r.json();
    if (!r.ok) throw new Error(payload?.message ?? `Resend respondió ${r.status}`);

    return (payload?.data ?? []) as Array<{ id: string }>;
  };

  /**
   * Cuántos mails de campaña salieron hoy.
   *
   * Desde la medianoche UTC, que es cuando Resend reinicia la cuenta. No
   * incluye ni las pruebas ni los mails transaccionales de la API, que
   * también descuentan: por eso la tanda por defecto son 85 y no 100.
   */
  const enviadosHoy = async () => {
    const medianoche = new Date();
    medianoche.setUTCHours(0, 0, 0, 0);

    const { count } = await admin_db
      .from("marketing_sends")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", medianoche.toISOString());

    return count ?? 0;
  };

  // --- Prueba -------------------------------------------------------------
  // Una sola dirección, no toca la lista ni marca la campaña como enviada. Es
  // lo que hay que usar antes de mandarle a mil personas un HTML que se ve mal
  // en Gmail.
  if (testEmail) {
    try {
      const url = `${env("CLIENT_URL")}/baja?token=prueba`;
      await enviar([
        {
          email: testEmail,
          html: personalizar(conBaja(campana.html, url), {
            id: "",
            email: testEmail,
            name: "Prueba",
            unsubscribe_token: "prueba",
          }),
        },
      ]);

      return json({ ok: true, test: true, sent: 1, from: de });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  // --- Envío real ---------------------------------------------------------
  if (campana.status === "sent") {
    return json({ error: "Esta campaña ya se envió" }, 409);
  }

  let contactos: Contacto[];
  let yaEnviados: Array<{ email: string }>;

  try {
    // Las dos por páginas: con más de mil contactos, una sola respuesta
    // vendría cortada en mil y ninguna de las dos cosas avisaría.
    contactos = await traerTodo<Contacto>((desde, hasta) =>
      admin_db
        .from("marketing_contacts")
        .select("id, email, name, unsubscribe_token")
        .eq("is_subscribed", true)
        .order("created_at", { ascending: true })
        .range(desde, hasta)
    );

    yaEnviados = await traerTodo<{ email: string }>((desde, hasta) =>
      admin_db
        .from("marketing_sends")
        .select("email")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true })
        .range(desde, hasta)
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }

  if (contactos.length > MAXIMO_DESTINATARIOS) {
    return json(
      {
        error: `La lista tiene ${contactos.length} contactos, más que el máximo de ${MAXIMO_DESTINATARIOS}`,
      },
      400
    );
  }

  // Quien ya la recibió no la recibe de nuevo: es lo que hace que reintentar
  // una campaña a medio mandar sea seguro, y lo que sostiene el envío por
  // tandas de un día para el otro.
  const enviados = new Set(yaEnviados.map((s) => String(s.email).toLowerCase()));
  const pendientes = contactos.filter((c) => !enviados.has(c.email.toLowerCase()));

  if (pendientes.length === 0) {
    // Se terminó de mandar en una tanda anterior: recién ahora la campaña
    // queda cerrada.
    await admin_db
      .from("marketing_campaigns")
      .update({ status: "sent", sent_at: campana.sent_at ?? new Date().toISOString() })
      .eq("id", campaignId);

    return json({
      ok: true,
      sent: 0,
      failed: 0,
      remaining: 0,
      done: true,
      message: "No quedan contactos por enviar",
    });
  }

  // --- Cuánto entra hoy ---------------------------------------------------
  const hoy = await enviadosHoy();
  const disponibleHoy = Math.max(0, LIMITE_DIARIO - hoy);

  if (disponibleHoy === 0) {
    return json(
      {
        error: `Hoy ya salieron ${hoy} mails y el límite diario de Resend es ${LIMITE_DIARIO}. Faltan ${pendientes.length} contactos: seguí mañana.`,
        remaining: pendientes.length,
        sent_today: hoy,
      },
      429
    );
  }

  const pedido = Number(body.limit);
  const tanda = Math.min(
    Number.isFinite(pedido) && pedido > 0 ? Math.floor(pedido) : TANDA_POR_DEFECTO,
    disponibleHoy,
    pendientes.length
  );

  const destinatarios = pendientes.slice(0, tanda);

  await admin_db.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let ok = 0;
  let fallados = 0;

  for (let i = 0; i < destinatarios.length; i += LOTE) {
    const lote = destinatarios.slice(i, i + LOTE);

    const preparados = lote.map((c) => ({
      contacto: c,
      email: c.email,
      html: personalizar(
        conBaja(campana.html, `${env("CLIENT_URL")}/baja?token=${c.unsubscribe_token}`),
        c
      ),
    }));

    try {
      const resultado = await enviar(preparados);

      await admin_db.from("marketing_sends").insert(
        preparados.map((p, n) => ({
          campaign_id: campaignId,
          contact_id: p.contacto.id,
          email: p.email,
          status: "sent",
          provider_id: resultado[n]?.id ?? null,
        }))
      );

      ok += preparados.length;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);

      // El lote entero queda registrado como fallido para poder reintentar
      // solo eso. Sin la fila, un reintento le escribiría de nuevo a todos.
      await admin_db.from("marketing_sends").insert(
        preparados.map((p) => ({
          campaign_id: campaignId,
          contact_id: p.contacto.id,
          email: p.email,
          status: "failed",
          error: mensaje.slice(0, 500),
        }))
      );

      fallados += preparados.length;
    }
  }

  const restantes = pendientes.length - destinatarios.length;
  const termino = restantes === 0;

  // Una campaña a medio mandar queda en "sending", no en "sent": si se marcara
  // como enviada, la tanda de mañana no tendría dónde volver. "sent" recién
  // cuando no queda nadie.
  await admin_db
    .from("marketing_campaigns")
    .update({
      status: termino ? (fallados && !ok ? "failed" : "sent") : "sending",
      sent_at: termino ? new Date().toISOString() : campana.sent_at,
      sent_count: campana.sent_count + ok,
      failed_count: campana.failed_count + fallados,
    })
    .eq("id", campaignId);

  return json({
    ok: true,
    sent: ok,
    failed: fallados,
    remaining: restantes,
    done: termino,
    sent_today: hoy + ok,
    daily_limit: LIMITE_DIARIO,
    message: termino
      ? `Enviada a ${ok} contactos${fallados ? `, ${fallados} fallaron` : ""}. No queda nadie pendiente.`
      : `Salieron ${ok}${fallados ? ` (${fallados} fallaron)` : ""}. Faltan ${restantes}: seguí mañana, cuando se reinicie la cuota de Resend.`,
  });
});
