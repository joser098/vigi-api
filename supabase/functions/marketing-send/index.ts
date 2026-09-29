// Envío de una campaña de email marketing.
//
// Corre en servidor por el mismo motivo que product-images y meli-price: las
// API keys no pueden estar en el bundle del panel. El panel arma la campaña y
// aprieta el botón; acá se decide a quién se le manda y se manda.
//
// Dos proveedores, cada uno en lo suyo:
//
//   - Unitpost manda el marketing. Su plan gratuito son 200 por día y 5000 por
//     mes, y no los comparte con nada.
//   - Resend queda para lo transaccional de vigi-api (confirmaciones de
//     compra). Lo que esos mails no usan de sus 100 diarios se aprovecha acá
//     como desborde, dejando siempre una reserva para que una compra nunca se
//     quede sin su mail.
//
// Sin UNITPOST_API_KEY todo sale por Resend, como antes.
//
// Desplegar:
//   npx supabase functions deploy marketing-send --project-ref <REF>
//   npx supabase secrets set UNITPOST_API_KEY=... RESEND_API_KEY=... MARKETING_FROM=... RESEND_MARKETING_FROM=... CLIENT_URL=...
//
// MARKETING_FROM es la dirección remitente, con el dominio verificado en
// Unitpost. RESEND_MARKETING_FROM es la de los mails que desbordan a Resend,
// con el dominio verificado ahí: el plan gratuito de Resend admite un solo
// dominio y ya lo usa lo transaccional. Sin ella se usa MARKETING_FROM.
//
// Las dos pueden ir solas ("hola@novedades.vigi.com.ar") o con nombre
// ("Vigi <hola@novedades.vigi.com.ar>"): el nombre para mostrar lo arma
// `remitente()` más abajo. CLIENT_URL es el sitio público, para armar
// el link de baja.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Los dos aceptan hasta 100 mails por llamada al endpoint batch.
const LOTE = 100;

// Plan gratuito de Unitpost: 200 por día y 5000 por mes, con corte duro. Las
// pruebas también descuentan y no dejan fila en marketing_sends: el colchón es
// para ellas.
const UNITPOST_DIARIO = 200;
const UNITPOST_MENSUAL = 5000;
const UNITPOST_COLCHON = 5;

// Plan gratuito de Resend: 100 por día, compartidos con los transaccionales de
// vigi-api, que salen con la misma API key. Las campañas usan como mucho lo
// que queda después de la reserva: si una campaña se come los 100, las
// confirmaciones de compra del día no salen.
const RESEND_DIARIO = 100;
const RESEND_RESERVA = 40;

type Proveedor = "unitpost" | "resend";

// Cuántos manda una tanda si el panel no pide otra cosa: todo lo que entre hoy.
const TANDA_POR_DEFECTO = UNITPOST_DIARIO - UNITPOST_COLCHON + RESEND_DIARIO - RESEND_RESERVA;

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

  const claves: Record<Proveedor, string> = {
    unitpost: env("UNITPOST_API_KEY"),
    resend: env("RESEND_API_KEY"),
  };
  const from = env("MARKETING_FROM");
  const fromResend = env("RESEND_MARKETING_FROM") || from;
  if (!from || (!claves.unitpost && !claves.resend)) {
    return json(
      { error: "Faltan MARKETING_FROM y al menos una de UNITPOST_API_KEY o RESEND_API_KEY en la function" },
      500
    );
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

  const de: Record<Proveedor, string> = {
    unitpost: remitente(from, campana.from_name),
    resend: remitente(fromResend, campana.from_name),
  };

  /**
   * Manda un lote por un proveedor y devuelve un id por mail.
   *
   * Resend devuelve un id por mail. Unitpost devuelve uno solo para todo el
   * lote: se repite en cada fila, alcanza para buscarlo en su panel.
   */
  const enviar = async (
    proveedor: Proveedor,
    destinatarios: Array<{ email: string; html: string }>
  ): Promise<Array<string | null>> => {
    const mails = destinatarios.map((d) => ({
      from: de[proveedor],
      to: proveedor === "resend" ? [d.email] : d.email,
      subject: campana.subject,
      html: d.html,
    }));

    const url =
      proveedor === "unitpost"
        ? "https://www.unitpost.com/api/v1/email/batch"
        : "https://api.resend.com/emails/batch";

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${claves[proveedor]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(proveedor === "unitpost" ? { emails: mails } : mails),
    });

    const payload = await r.json().catch(() => null);
    if (!r.ok) {
      const detalle = payload?.error?.message ?? payload?.message ?? payload?.error;
      throw new Error(
        typeof detalle === "string" ? detalle : `${proveedor === "unitpost" ? "Unitpost" : "Resend"} respondió ${r.status}`
      );
    }

    if (proveedor === "unitpost") {
      const id = payload?.data?.id ?? null;
      return destinatarios.map(() => id);
    }

    const ids = (payload?.data ?? []) as Array<{ id: string }>;
    return destinatarios.map((_, n) => ids[n]?.id ?? null);
  };

  /**
   * Cuántos mails de campaña salieron por un proveedor desde `desde`.
   *
   * No incluye ni las pruebas ni los transaccionales de la API: para eso están
   * el colchón de Unitpost y la reserva de Resend.
   */
  const enviadosDesde = async (proveedor: Proveedor, desde: Date) => {
    const { count } = await admin_db
      .from("marketing_sends")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .eq("provider", proveedor)
      .gte("created_at", desde.toISOString());

    return count ?? 0;
  };

  /**
   * Lo que le queda hoy a cada proveedor.
   *
   * Los días y los meses se cuentan en UTC, que es cuando los proveedores
   * reinician la cuenta. Un proveedor sin API key tiene cero.
   */
  const cupo = async () => {
    const medianoche = new Date();
    medianoche.setUTCHours(0, 0, 0, 0);
    const inicioMes = new Date(Date.UTC(medianoche.getUTCFullYear(), medianoche.getUTCMonth(), 1));

    const [uniHoy, uniMes, resHoy] = await Promise.all([
      enviadosDesde("unitpost", medianoche),
      enviadosDesde("unitpost", inicioMes),
      enviadosDesde("resend", medianoche),
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

  // --- Prueba -------------------------------------------------------------
  // Una sola dirección, no toca la lista ni marca la campaña como enviada. Es
  // lo que hay que usar antes de mandarle a mil personas un HTML que se ve mal
  // en Gmail.
  // Sale por el proveedor que manda las campañas, para ver el mail tal cual lo
  // va a recibir la gente (con el pie de Unitpost incluido, en el plan gratis).
  if (testEmail) {
    const proveedor: Proveedor = claves.unitpost ? "unitpost" : "resend";

    try {
      const url = `${env("CLIENT_URL")}/baja?token=prueba`;
      await enviar(proveedor, [
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

      return json({ ok: true, test: true, sent: 1, from: de[proveedor], provider: proveedor });
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
  const { hoy, disponible, detalle } = await cupo();
  const disponibleHoy = disponible.unitpost + disponible.resend;

  if (disponibleHoy === 0) {
    return json(
      {
        error: `Hoy ya salieron ${hoy} mails de campaña y no queda cupo en ningún proveedor. Faltan ${pendientes.length} contactos: seguí mañana.`,
        remaining: pendientes.length,
        sent_today: hoy,
        quota: detalle,
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

  // Primero Unitpost, que es el que está para esto; Resend solo con lo que
  // Unitpost no alcanza a cubrir hoy.
  const lotes: Array<{ proveedor: Proveedor; contactos: Contacto[] }> = [];
  const porUnitpost = Math.min(disponible.unitpost, destinatarios.length);
  const reparto: Array<[Proveedor, Contacto[]]> = [
    ["unitpost", destinatarios.slice(0, porUnitpost)],
    ["resend", destinatarios.slice(porUnitpost)],
  ];
  for (const [proveedor, grupo] of reparto) {
    for (let i = 0; i < grupo.length; i += LOTE) {
      lotes.push({ proveedor, contactos: grupo.slice(i, i + LOTE) });
    }
  }

  for (const { proveedor, contactos: lote } of lotes) {
    const preparados = lote.map((c) => ({
      contacto: c,
      email: c.email,
      html: personalizar(
        conBaja(campana.html, `${env("CLIENT_URL")}/baja?token=${c.unsubscribe_token}`),
        c
      ),
    }));

    try {
      const ids = await enviar(proveedor, preparados);

      await admin_db.from("marketing_sends").insert(
        preparados.map((p, n) => ({
          campaign_id: campaignId,
          contact_id: p.contacto.id,
          email: p.email,
          status: "sent",
          provider: proveedor,
          provider_id: ids[n],
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
          provider: proveedor,
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
    by_provider: { unitpost: porUnitpost, resend: destinatarios.length - porUnitpost },
    message: termino
      ? `Enviada a ${ok} contactos${fallados ? `, ${fallados} fallaron` : ""}. No queda nadie pendiente.`
      : `Salieron ${ok}${fallados ? ` (${fallados} fallaron)` : ""}. Faltan ${restantes}: seguí mañana, cuando se reinicie la cuota.`,
  });
});
