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
// MARKETING_FROM es la dirección remitente, con dominio verificado en Resend
// (ej: "VIGI <novedades@vigi.cam>"). CLIENT_URL es el sitio público, para
// armar el link de baja.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Resend acepta hasta 100 mails por llamada al endpoint batch.
const LOTE = 100;

// Freno de mano. Una campaña más grande que esto es casi siempre un error de
// carga, y del otro lado hay gente real: mejor que falle a que salga.
const MAXIMO_DESTINATARIOS = 5000;

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
  let body: { campaign_id?: string; test_email?: string };
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

  const enviar = async (destinatarios: Array<{ email: string; html: string }>) => {
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        destinatarios.map((d) => ({
          from,
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

      return json({ ok: true, test: true, sent: 1 });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 502);
    }
  }

  // --- Envío real ---------------------------------------------------------
  if (campana.status === "sent") {
    return json({ error: "Esta campaña ya se envió" }, 409);
  }

  const { data: contactos, error: errContactos } = await admin_db
    .from("marketing_contacts")
    .select("id, email, name, unsubscribe_token")
    .eq("is_subscribed", true);

  if (errContactos) return json({ error: errContactos.message }, 500);

  // Quien ya la recibió no la recibe de nuevo: es lo que hace que reintentar
  // una campaña a medio mandar sea seguro.
  const { data: yaEnviados } = await admin_db
    .from("marketing_sends")
    .select("email")
    .eq("campaign_id", campaignId);

  const enviados = new Set((yaEnviados ?? []).map((s: { email: string }) => String(s.email).toLowerCase()));
  const pendientes = ((contactos ?? []) as Contacto[]).filter(
    (c) => !enviados.has(c.email.toLowerCase())
  );

  if (pendientes.length === 0) {
    return json({ ok: true, sent: 0, failed: 0, message: "No quedan contactos por enviar" });
  }

  if (pendientes.length > MAXIMO_DESTINATARIOS) {
    return json(
      { error: `La lista tiene ${pendientes.length} contactos, más que el máximo de ${MAXIMO_DESTINATARIOS}` },
      400
    );
  }

  await admin_db.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let ok = 0;
  let fallados = 0;

  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);

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

  await admin_db
    .from("marketing_campaigns")
    .update({
      status: fallados && !ok ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      sent_count: campana.sent_count + ok,
      failed_count: campana.failed_count + fallados,
    })
    .eq("id", campaignId);

  return json({ ok: true, sent: ok, failed: fallados });
});
