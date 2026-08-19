const { query } = require("../db/client");
const { isUuid } = require("../db/uuid");

// price is the effective price, so callers never have to apply the discount
// themselves. price_original and price_diferred are null when no promotion
// applies, matching what the old JS helper left on the object.
const PRODUCT_FIELDS = `
  p.id,
  p.model,
  p.title,
  p.thumbnail,
  p.provider,
  p.category,
  p.tags,
  p.has_promotion,
  p.discount,
  p.location,
  p.power_type,
  p.is_analogue,
  p.description,
  p.others,
  p.gallery,
  p.details,
  p.dvr_details,
  p.portero_details,
  p.alarm_details,
  p.storage_details,
  p.kit_details,
  p.effective_price as price,
  case when p.has_promotion and p.discount between 1 and 50
       then p.price end as price_original,
  case when p.has_promotion and p.discount between 1 and 50
       then p.price - p.effective_price end as price_diferred
`;

// interior, exterior, bateria and analogas are browse facets, not categories.
// They resolve against their own columns now instead of the details JSONB.
// Keys are the canonical form produced by normalizeCategory.
const FACETS = {
  interior: "p.location = 'interior'",
  exterior: "p.location = 'exterior'",
  bateria: "p.power_type = 'bateria'",
  analogas: "p.is_analogue",
};

// ORDER BY cannot be parameterised, so the direction comes off a whitelist.
const priceOrder = (order) => {
  if (order === "asc") return "order by p.effective_price asc";
  if (order === "desc") return "order by p.effective_price desc";
  return "";
};

const findById = async (id) => {
  if (!isUuid(id)) throw new Error("El id del producto no es válido");

  const { rows } = await query(
    `select ${PRODUCT_FIELDS} from products p where p.id = $1 and p.is_active`,
    [id]
  );

  return rows[0] ?? null;
};

const findByModel = async (model) => {
  const { rows } = await query(
    `select ${PRODUCT_FIELDS} from products p where p.model = $1 and p.is_active`,
    [model]
  );

  return rows[0] ?? null;
};

const findAll = async () => {
  const { rows } = await query(
    `select ${PRODUCT_FIELDS} from products p where p.is_active order by p.title`
  );

  return rows;
};

const findByCategory = async (category, order) => {
  const facet = FACETS[category];

  if (facet) {
    const { rows } = await query(
      `select ${PRODUCT_FIELDS}
         from products p
        where p.is_active and ${facet}
        ${priceOrder(order)}`
    );

    return rows;
  }

  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from products p
      where p.is_active and p.category = $1
      ${priceOrder(order)}`,
    [category]
  );

  return rows;
};

const findInPromotion = async (order) => {
  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from products p
      where p.is_active and p.has_promotion
      ${priceOrder(order)}`
  );

  return rows;
};

const findSimilar = async (category, provider) => {
  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from products p
      where p.is_active and p.category = $1 and p.provider = $2
      order by p.effective_price asc`,
    [category, provider]
  );

  return rows;
};

// Matching stays "contains", same as the old regex, so nothing that used to be
// found disappears. What changes is the ordering: results come back by trigram
// similarity instead of by price, so the closest match leads.
// Cada término tiene que aparecer en algún lado, no la frase completa: el
// proveedor escribe "Exterior | Plastica | Domo", así que buscar "domo
// exterior" como frase no encontraría nada.
//
// La descripción entra en el match pero no en el ranking: los títulos del
// catálogo son "Marca MODELO", así que sin ella buscar "camara" no devuelve
// nada. Para ordenar sigue mandando título y modelo, que identifican al
// producto.
const SEARCH_WHERE = `
  p.is_active
  and (
    select bool_and(
      p.title ilike '%' || term || '%'
      or p.model ilike '%' || term || '%'
      or p.description ilike '%' || term || '%'
      or exists (select 1 from unnest(p.tags) tag where tag ilike '%' || term || '%')
    )
    from unnest($2::text[]) as term
  )
`;

const RELEVANCE = `greatest(similarity(p.title, $1), similarity(p.model, $1))`;

const terms = (keyword) =>
  String(keyword ?? "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const search = async (keyword, limit) => {
  const parts = terms(keyword);
  if (parts.length === 0) return [];

  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from products p
      where ${SEARCH_WHERE}
      order by ${RELEVANCE} desc, p.effective_price asc
      limit $3`,
    [keyword, parts, limit ?? 100]
  );

  return rows;
};

// Same matching as search, but Ezviz leads. That priority used to be a JS sort
// applied after every row had already been fetched.
const suggest = async (keyword, limit) => {
  const parts = terms(keyword);
  if (parts.length === 0) return [];

  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from products p
      where ${SEARCH_WHERE}
      order by (p.provider = 'Ezviz') desc,
               ${RELEVANCE} desc,
               p.effective_price asc
      limit $3`,
    [keyword, parts, limit ?? 10]
  );

  return rows;
};

/**
 * Recomendador del asistente del home ("Encontrá la tuya").
 *
 * Antes el asistente no consultaba nada: mapeaba una respuesta a una categoría
 * y mandaba al cliente ahí. Con eso, tres preguntas terminaban en un listado de
 * 300 cámaras sin filtrar, y las 379 alarmas, porteros, cerraduras y grabadores
 * del catálogo eran inalcanzables desde el asistente.
 *
 * Acá se separan dos cosas que no son lo mismo:
 *
 *   FILTROS DUROS   descartan lo que directamente no sirve. Si el cliente dice
 *                   que no tiene enchufe, una cámara cableada no es "peor
 *                   opción": no funciona. Lo mismo con el presupuesto.
 *
 *   RANKING BLANDO  ordena lo que sí sirve. La ubicación entra acá y no como
 *                   filtro porque 341 productos activos no la tienen cargada:
 *                   filtrar por ella escondería media tienda. Los que coinciden
 *                   suben, los que no tienen el dato quedan abajo pero visibles.
 *
 * Devuelve también cuántos coinciden en total, que es lo que le permite al
 * asistente decir "23 opciones" en vez de mostrar una lista sin contexto.
 */
// Marcas que el asistente ofrece por categoría.
//
// No es un filtro técnico sino comercial: Ezviz e Imou son las líneas de
// consumo final, que es a quien le habla el asistente. Hikvision y Dahua son
// gama instalador —127 y 90 cámaras— y recomendárselas a alguien que dijo "no
// hace falta que sepas de cámaras" es mandarlo a elegir mal.
//
// Es un mapa por categoría y no una lista global a propósito: los porteros son
// mayormente Commax (30 de 46) y las cerraduras son todas Ezviz, así que
// aplicar la misma regla ahí dejaría esas ramas casi sin catálogo. Las
// categorías que no figuran acá no se filtran por marca.
//
// Ojo con achicar de más: alarmas queda en 12 productos porque Imou no tiene
// ninguna. Antes de sumar una categoría, mirar cuántos productos quedan
// realmente — un asistente que contesta "0 opciones" es peor que uno que
// recomienda una marca de segunda.
const MARCAS_DESTACADAS = {
  camaras: ["Ezviz", "Imou"],
  alarmas: ["Ezviz", "Imou"],
};

/**
 * Accesorios que el proveedor carga dentro de "camaras": paneles solares,
 * baterías externas y soportes de pared. Recomendarle un soporte de $13.000 a
 * alguien que pidió una cámara es una mala recomendación, así que el asistente
 * no los ofrece.
 *
 * El patrón está anclado al ARRANQUE de la descripción, que es donde el
 * proveedor declara qué es el producto. Sin anclar se llevaba puestas las
 * cámaras solares reales —EB5 4K, HB90, la línea HB8— que mencionan "Panel
 * Solar" o "Batería" entre sus prestaciones.
 *
 * Descartado a propósito: filtrar por `details->>'resolution' is null`. Parecía
 * más limpio, pero 11 cámaras reales de lente dual (H9C DUAL, CRUISER, EB5 4K,
 * HB90) no cargan ese campo porque su resolución está en la descripción. Habría
 * escondido justo los modelos premium.
 *
 * Esto es un parche sobre datos, no la solución: lo correcto es que estos
 * productos no estén en la categoría "camaras". Se arregla en el importador
 * (db/import/catalogue-map.js) y el día que pase, esta constante sobra.
 */
const ACCESORIO = "^(panel solar|soporte de montaje|(bater[ií]a )?[0-9]+ ?w[ (])";

const DESCRIPCION_NORMALIZADA = `regexp_replace(coalesce(p.description,''),'\s+',' ','g')`;

const recommend = async ({
  category = null,
  location = null,
  battery = null,
  budgetMax = null,
  limit = 8,
} = {}) => {
  const where = ["p.is_active"];
  const params = [];
  const $ = (valor) => {
    params.push(valor);
    return `$${params.length}`;
  };

  if (category) {
    where.push(`p.category = ${$(category)}`);

    // Filtro duro: si la categoría tiene marcas elegidas, el resto no se
    // ofrece. La búsqueda y el catálogo siguen mostrando todo; esto acota solo
    // lo que el asistente recomienda.
    const marcas = MARCAS_DESTACADAS[category];
    if (marcas) where.push(`p.provider = any(${$(marcas)})`);

    if (category === "camaras") {
      where.push(`not (${DESCRIPCION_NORMALIZADA} ~* ${$(ACCESORIO)})`);
    }
  }
  if (budgetMax) where.push(`p.effective_price <= ${$(budgetMax)}`);

  // La batería es excluyente en los dos sentidos: quien no tiene enchufe no
  // puede usar una cableada, y quien lo tiene no quiere estar cambiando pilas.
  if (battery === true) where.push(`'bateria' = any(p.tags)`);
  if (battery === false) where.push(`not ('bateria' = any(p.tags))`);

  // Sin foto el producto se ve roto en una grilla de recomendaciones.
  where.push(`p.thumbnail is not null`);

  const filtro = where.join(" and ");

  const score = `
    (case when ${location ? `p.location::text = ${$(location)}` : "false"}
          then 3 else 0 end)
  + (case when p.location is null then 0 else 1 end)
  + (case when p.has_promotion then 1 else 0 end)
  `;

  const { rows } = await query(
    `select ${PRODUCT_FIELDS}, ${score} as score,
            count(*) over () :: int as total
       from products p
      where ${filtro}
      order by score desc, p.effective_price asc
      limit ${$(limit)}`,
    params
  );

  return {
    total: rows[0]?.total ?? 0,
    // score y total son del ranking, no del producto: no salen a la respuesta.
    items: rows.map(({ score, total, ...producto }) => producto),
  };
};

module.exports = {
  PRODUCT_FIELDS,
  findById,
  findByModel,
  findAll,
  findByCategory,
  findInPromotion,
  findSimilar,
  search,
  suggest,
  recommend,
};
