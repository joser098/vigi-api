/**
 * Arma los bultos de un pedido a partir de los ítems del carrito.
 *
 * Reemplaza al bulto fijo de 3,5 kg que se cotizaba para todo: un kit real pesa
 * 10 o 18 kg y se estaba cotizando a un tercio de lo que factura el correo.
 *
 * Es una aproximación deliberadamente simple, no un bin packing: cada unidad
 * se acuesta sobre su cara más grande y se apilan una arriba de la otra. Largo
 * y ancho del bulto son los máximos; el alto, la suma. Sobreestima un poco el
 * volumen de varios ítems chicos, que es el lado bueno para equivocarse.
 *
 * Cuando una pila pasa los límites de Correo Argentino (25 kg, 150 cm por lado)
 * se abre otro bulto, y la cotización suma lo de todos.
 *
 * Función pura, sin base: recibe las medidas ya resueltas
 * (product.repository.findShippingDims: caja del perfil, peso del producto o
 * del perfil).
 */

const MAX_WEIGHT_GRAMS = 25000;
const MAX_SIDE_CM = 150;

class BultoError extends Error {}

/** Lados de mayor a menor: [largo, ancho, alto]. */
const orient = (u) =>
  [u.length_cm, u.width_cm, u.height_cm].map(Number).sort((a, b) => b - a);

/**
 * @param items [{ id, quantity }] del carrito
 * @param dims  [{ id, weight_grams, height_cm, width_cm, length_cm }]
 * @returns [{ weight, height, width, length }] enteros, listos para /rates
 */
const buildPackages = (items, dims) => {
  const byId = new Map(dims.map((d) => [d.id, d]));
  const units = [];

  for (const item of items) {
    const d = byId.get(item.id);

    if (!d || [d.weight_grams, d.height_cm, d.width_cm, d.length_cm].some((v) => !(Number(v) > 0))) {
      throw new BultoError(`Sin peso y medidas de envío para el producto ${item.id}`);
    }

    const [length, width, height] = orient(d);
    const weight = Number(d.weight_grams);

    if (weight > MAX_WEIGHT_GRAMS || length > MAX_SIDE_CM) {
      throw new BultoError(
        `El producto ${item.id} supera lo que acepta Correo Argentino por bulto (25 kg, 150 cm)`
      );
    }

    for (let i = 0; i < Number(item.quantity); i++) {
      units.push({ weight, length, width, height });
    }
  }

  // Los más pesados primero: quedan abajo y reparten mejor entre bultos.
  units.sort((a, b) => b.weight - a.weight);

  const packages = [];

  for (const u of units) {
    const fits = packages.find(
      (p) =>
        p.weight + u.weight <= MAX_WEIGHT_GRAMS &&
        p.height + u.height <= MAX_SIDE_CM
    );

    if (fits) {
      fits.weight += u.weight;
      fits.height += u.height;
      fits.length = Math.max(fits.length, u.length);
      fits.width = Math.max(fits.width, u.width);
    } else {
      packages.push({ ...u });
    }
  }

  return packages.map((p) => ({
    weight: Math.ceil(p.weight),
    height: Math.ceil(p.height),
    width: Math.ceil(p.width),
    length: Math.ceil(p.length),
  }));
};

module.exports = { buildPackages, BultoError, MAX_WEIGHT_GRAMS, MAX_SIDE_CM };
