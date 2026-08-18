// Precio de referencia de MercadoLibre para un producto.
//
// Corre en servidor por el mismo motivo que product-images: hay credenciales
// que no pueden estar en el navegador. Desde 2024 MercadoLibre responde 403 a
// `GET /sites/MLA/search` sin token, y el client_secret no puede viajar al
// cliente.
//
// Se llama de a un producto por vez, desde su detalle en el panel. No hay
// trabajo masivo: el catálogo son más de 500 productos y no tiene sentido
// consultarlos todos para mirar tres.
//
// Desplegar:
//   npx supabase functions deploy meli-price --project-ref <REF>
//   npx supabase secrets set MELI_CLIENT_ID=... MELI_CLIENT_SECRET=...
//
// Antes de la primera llamada hay que sembrar el refresh_token a mano: ver
// README.md en esta carpeta.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MELI_SITE = "MLA"; // Argentina
const MELI_API = "https://api.mercadolibre.com";

// Cuántos resultados miramos antes de elegir. Más que esto es ruido:
// MercadoLibre ordena por relevancia y a partir de ahí aparecen accesorios.
const SEARCH_LIMIT = 50;

// Colchón para no usar un token que vence mientras estamos pidiendo.
const TOKEN_SKEW_MS = 60_000;

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

/**
 * Devuelve un access token válido, renovándolo si hace falta.
 *
 * MercadoLibre no tiene client_credentials: los únicos grants son
 * authorization_code y refresh_token, y cada refresh devuelve un
 * refresh_token nuevo que invalida al anterior. Si no se persiste esa
 * rotación la integración se corta sola a las pocas horas, así que los tokens
 * viven en tabla y no en el entorno.
 */
async function getAccessToken(admin: ReturnType<typeof createClient>) {
  const { data: creds, error } = await admin
    .from("meli_credentials")
    .select("access_token, refresh_token, expires_at")
    .eq("id", true)
    .maybeSingle();

  if (error) throw new Error(`No pude leer las credenciales: ${error.message}`);
  if (!creds?.refresh_token) {
    throw new Error(
      "Falta el refresh_token de MercadoLibre. Hay que hacer una vez el flujo de autorización: ver el README de esta function."
    );
  }

  const vigente =
    creds.access_token &&
    creds.expires_at &&
    new Date(creds.expires_at).getTime() - TOKEN_SKEW_MS > Date.now();

  if (vigente) return creds.access_token as string;

  const res = await fetch(`${MELI_API}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env("MELI_CLIENT_ID"),
      client_secret: env("MELI_CLIENT_SECRET"),
      refresh_token: creds.refresh_token,
    }),
  });

  const token = await res.json();

  if (!res.ok || !token.access_token) {
    throw new Error(
      `MercadoLibre rechazó el refresh (${res.status}): ${
        token.message ?? token.error ?? "sin detalle"
      }`
    );
  }

  // Se guarda antes de usarlo: el refresh_token viejo ya quedó invalidado, y
  // perder el nuevo obliga a rehacer la autorización a mano.
  const { error: saveError } = await admin.from("meli_credentials").upsert({
    id: true,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? creds.refresh_token,
    expires_at: new Date(
      Date.now() + (token.expires_in ?? 21600) * 1000
    ).toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (saveError) {
    throw new Error(
      `Renové el token pero no pude guardarlo, y el anterior ya no sirve: ${saveError.message}`
    );
  }

  return token.access_token as string;
}

/**
 * De los resultados, la publicación nueva más barata de un vendedor confiable.
 *
 * El mínimo a secas no sirve: los primeros puestos por precio suelen ser
 * repuestos, usados o vendedores sin reputación. Contra ese número no
 * competimos.
 *
 * Los campos siguen la respuesta documentada de /sites/{site}/search, pero no
 * se pudieron verificar contra una respuesta real todavía. Está escrito a la
 * defensiva: lo que no viene se descarta en vez de romper.
 */
function pickBest(results: any[]) {
  const confiable = (item: any) => {
    if (item?.condition !== "new") return false;
    if (typeof item?.price !== "number" || item.price <= 0) return false;

    // Tienda oficial alcanza por sí sola.
    if (item?.official_store_id) return true;

    const status = item?.seller?.seller_reputation?.power_seller_status;
    const nivel = item?.seller?.seller_reputation?.level_id ?? "";

    // MercadoLíder en cualquiera de sus niveles, o verde en la escala de
    // colores (4 y 5 son los verdes).
    return (
      status === "platinum" ||
      status === "gold" ||
      status === "silver" ||
      nivel.startsWith("5_") ||
      nivel.startsWith("4_")
    );
  };

  const candidatos = results.filter(confiable);

  // Preferimos no inventar un número: mejor decir que no hay referencia que
  // guardar el precio de un repuesto.
  if (candidatos.length === 0) return null;

  return candidatos.reduce((a, b) => (b.price < a.price ? b : a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    // --- Autorización -----------------------------------------------------
    // Con el token del usuario, para que la consulta a admin_users pase por
    // RLS: la whitelist sigue siendo la única fuente de verdad, igual que en
    // el resto del panel.
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization) return json({ error: "Falta el token" }, 401);

    const caller = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });

    const { data: esAdmin } = await caller
      .from("admin_users")
      .select("email")
      .maybeSingle();
    if (!esAdmin) return json({ error: "No autorizado" }, 403);

    // --- Payload ----------------------------------------------------------
    const { product_id } = await req.json().catch(() => ({}));
    if (!product_id) return json({ error: "Falta product_id" }, 400);

    // La service role saltea RLS: es la única que puede tocar meli_credentials.
    const admin = createClient(
      env("SUPABASE_URL"),
      env("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: producto, error: prodError } = await admin
      .from("products")
      .select("id, model, provider")
      .eq("id", product_id)
      .maybeSingle();

    if (prodError) return json({ error: prodError.message }, 500);
    if (!producto) return json({ error: "Producto inexistente" }, 404);

    // --- MercadoLibre -----------------------------------------------------
    const token = await getAccessToken(admin);

    const query = [producto.provider, producto.model].filter(Boolean).join(" ");
    const search = new URL(`${MELI_API}/sites/${MELI_SITE}/search`);
    search.searchParams.set("q", query);
    search.searchParams.set("condition", "new");
    search.searchParams.set("limit", String(SEARCH_LIMIT));

    const res = await fetch(search, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();

    if (!res.ok) {
      return json(
        {
          error: `MercadoLibre respondió ${res.status}: ${body?.message ?? ""}`,
        },
        502
      );
    }

    const best = pickBest(Array.isArray(body?.results) ? body.results : []);

    if (!best) {
      // Se registra el intento igual: así en el panel se distingue "buscamos y
      // no había" de "nunca lo buscamos".
      await admin
        .from("products")
        .update({
          meli_price: null,
          meli_url: null,
          meli_title: null,
          meli_checked_at: new Date().toISOString(),
        })
        .eq("id", product_id);

      return json({ found: false, query });
    }

    const resultado = {
      meli_price: best.price,
      meli_url: best.permalink ?? null,
      meli_title: best.title ?? null,
      meli_checked_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("products")
      .update(resultado)
      .eq("id", product_id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ found: true, query, ...resultado });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
