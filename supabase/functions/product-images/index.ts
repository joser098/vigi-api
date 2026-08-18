// Gestión de imágenes de producto en R2.
//
// Es la única pieza del panel que corre en servidor, y existe por un motivo
// puntual: las credenciales de R2 no pueden estar en el navegador. Todo lo
// demás (leer, editar precios, promos) lo hace vigi-admin directo contra
// Postgres con RLS.
//
// Recibe el orden final completo de la galería y reescribe 0.png, 1.png, … a
// partir de ahí. Manda el cliente el estado deseado, no una secuencia de
// operaciones: así agregar, reordenar y borrar son el mismo caso y no hay
// estados intermedios raros si algo falla a mitad de camino.
//
// Desplegar:
//   npx supabase functions deploy product-images --project-ref <REF>
//   npx supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
//       R2_SECRET_ACCESS_KEY=... R2_BUCKET_NAME=... R2_PUBLIC_URL=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const env = (k: string) => Deno.env.get(k) ?? "";

const r2 = new AwsClient({
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});

const bucketUrl = () =>
  `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${env("R2_BUCKET_NAME")}`;

// Mismas reglas que usa el frontend de la tienda para armar las rutas:
// el espacio va como "+", la barra queda como carpeta real.
const keyModel = (m: string) => m.replace(/ /g, "+");
const urlModel = (m: string) => encodeURIComponent(m).replace(/%20/g, "+");

const galleryKey = (model: string, i: number) => `gallery/${keyModel(model)}/${i}.png`;
const thumbKey = (model: string) => `thumbnails/${keyModel(model)}.png`;
// La clave en R2 y la URL pública se escriben distinto: la barra va literal en
// la clave y como %2F en la URL.
const thumbUrl = (model: string) =>
  `${env("R2_PUBLIC_URL")}/thumbnails/${urlModel(model)}.png`;

const get = async (key: string) => {
  const r = await r2.fetch(`${bucketUrl()}/${key}`);
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
};

const put = (key: string, body: Uint8Array, contentType: string) =>
  r2.fetch(`${bucketUrl()}/${key}`, {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

const del = (key: string) => r2.fetch(`${bucketUrl()}/${key}`, { method: "DELETE" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // --- Autorización -------------------------------------------------------
  // Se usa el token del usuario, no la service_role: así la consulta a
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
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Se esperaba multipart/form-data" }, 400);
  }

  const model = String(form.get("model") ?? "").trim();
  if (!model) return json({ error: "Falta el modelo" }, 400);

  // orden: lista del estado final deseado.
  //   { tipo: "existente", indice: 2 }  -> la imagen que hoy está en 2.png
  //   { tipo: "nueva", archivo: 0 }     -> el archivo subido como file0
  let orden: Array<{ tipo: string; indice?: number; archivo?: number }>;
  try {
    orden = JSON.parse(String(form.get("orden") ?? "[]"));
  } catch {
    return json({ error: "orden inválido" }, 400);
  }

  if (orden.length > 12) return json({ error: "Máximo 12 imágenes por producto" }, 400);

  // --- Resolver los bytes de cada posición --------------------------------
  // Se leen TODAS las fuentes antes de escribir nada. Sin esto, reordenar
  // pisaría un origen antes de haberlo leído (mover 0->1 y 1->0 rompe).
  const finales: Uint8Array[] = [];

  for (const item of orden) {
    if (item.tipo === "existente") {
      const bytes = await get(galleryKey(model, item.indice ?? -1));
      if (!bytes) return json({ error: `No se encontró la imagen ${item.indice}` }, 404);
      finales.push(bytes);
      continue;
    }

    const file = form.get(`file${item.archivo}`);
    if (!(file instanceof File)) return json({ error: `Falta el archivo ${item.archivo}` }, 400);
    if (file.size > 8 * 1024 * 1024) return json({ error: `${file.name} pesa más de 8 MB` }, 413);
    if (!file.type.startsWith("image/")) return json({ error: `${file.name} no es una imagen` }, 415);

    finales.push(new Uint8Array(await file.arrayBuffer()));
  }

  // --- Escribir ------------------------------------------------------------
  // La galería de la tienda pide .png fijo; el navegador renderiza por
  // Content-Type, así que se guardan como png sin convertir.
  for (let i = 0; i < finales.length; i++) {
    const r = await put(galleryKey(model, i), finales[i], "image/png");
    if (!r.ok) return json({ error: `Falló al subir la imagen ${i}` }, 502);
  }

  // Sobrantes de una galería que antes era más larga.
  for (let i = finales.length; i < finales.length + 12; i++) {
    const existe = await get(galleryKey(model, i));
    if (!existe) break;
    await del(galleryKey(model, i));
  }

  // El thumbnail de los listados es siempre la primera imagen.
  let thumbnail: string | null = null;
  if (finales.length > 0) {
    await put(thumbKey(model), finales[0], "image/png");
    thumbnail = thumbUrl(model);
  } else {
    await del(thumbKey(model));
  }

  // La fila la actualiza el propio usuario, así que pasa por los GRANT y el
  // RLS de siempre. La función no escribe en la base con privilegios.
  const { error } = await supabase
    .from("products")
    .update({ thumbnail, gallery: finales.length })
    .eq("model", model);

  if (error) return json({ error: error.message }, 400);

  return json({ ok: true, total: finales.length, thumbnail });
});
