const productRepository = require("../../repositories/product.repository");

// Whitelists: lo que llega por query string no se pasa a la consulta sin
// revisar. No es solo por inyección —el repositorio parametriza todo— sino
// porque un valor inventado devolvería cero resultados sin explicar por qué.
const CATEGORIAS = new Set([
  "camaras",
  "kits",
  "alarmas",
  "porteros",
  "cerraduras",
  "grabadores",
  "accesos",
  "redes",
  "almacenamiento",
  "monitores",
]);

const UBICACIONES = new Set(["interior", "exterior"]);

const limpio = (valor, permitidos) =>
  permitidos.has(String(valor ?? "")) ? String(valor) : null;

const recommend = async (req, res) => {
  try {
    const { category, location, power, budget, limit } = req.query;

    // "ambas" es una respuesta válida del asistente y significa justamente que
    // la ubicación no debe pesar: se manda como null.
    const ubicacion = limpio(location, UBICACIONES);

    const bateria =
      power === "bateria" ? true : power === "enchufe" ? false : null;

    const tope = Number(budget);
    const cantidad = Number(limit);

    const data = await productRepository.recommend({
      category: limpio(category, CATEGORIAS),
      location: ubicacion,
      battery: bateria,
      budgetMax: Number.isFinite(tope) && tope > 0 ? tope : null,
      limit: Number.isFinite(cantidad) ? Math.min(Math.max(cantidad, 1), 24) : 8,
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = recommend;
