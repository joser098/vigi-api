const micorreo = require("./micorreo");
const productRepository = require("../repositories/product.repository");
const { buildPackages } = require("./bulto");

// CABA: todo envío es gratis por zona, a domicilio o a sucursal.
//
// This used to be decided by zip code prefix (["10", "11", "12", "14"]), which
// gave shipping away: a province address saved with a Capital zip — San Justo
// with 1416, say — matched "14" and came back free without ever quoting. Since
// createPaymentOrder shares this function, those orders were also charged $0
// of shipping.
//
// The province is the field that actually defines the zone. It comes from the
// `provinces` table, where CABA is seeded as "Ciudad Autónoma de Buenos Aires".
const CABA = "Ciudad Autónoma de Buenos Aires";

/**
 * Fuera de CABA, el retiro en sucursal es gratis a partir de este subtotal. El
 * envío a domicilio fuera de CABA se cobra siempre.
 *
 * El número viene de cuando el envío gratis era a domicilio con Andreani: con
 * 23,1% de margen sobre el precio y ~6% de pasarela quedan 17,1 puntos para
 * absorber el envío, y a $450.000 el peor destino dejaba 8,6% neto. Correo a
 * sucursal es más barato que aquel domicilio, así que hoy sobra margen. Revisar
 * contra las tarifas de Correo antes de bajarlo.
 */
const FREE_SHIPPING_MIN_PURCHASE = 450000;

// `addresses.province` is free text, so normalize and accept the spellings an
// address may carry from before the signup form used the table.
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const CABA_ALIASES = new Set(
  [CABA, "CABA", "C.A.B.A.", "Capital Federal", "Ciudad de Buenos Aires"].map(
    normalize
  )
);

const isCaba = (address) => CABA_ALIASES.has(normalize(address?.province));

/**
 * Formas de entrega:
 *
 * - `D` Correo Argentino a domicilio.
 * - `S` Correo Argentino, retiro en una sucursal.
 * - `A` acordar el envío: no se cobra, el cliente paga solo los productos y se
 *   coordina después por WhatsApp o mail. Existe para no perder la venta: el
 *   cliente puede tener otra forma de recibirlo, y es la salida cuando Correo
 *   no cotiza (caído, CP raro, bulto fuera de medida).
 */
const DELIVERY_TYPES = ["D", "S", "A"];

/**
 * Cotiza las formas de entrega y devuelve la elegida.
 *
 * Gratis: en CABA, domicilio y sucursal; fuera de CABA, solo la sucursal y
 * desde FREE_SHIPPING_MIN_PURCHASE.
 *
 * El bulto sale de los ítems del carrito (services/bulto). Si no entra en uno
 * se cotiza cada bulto y se suman.
 *
 * Si Correo falla no se lanza: `options` queda en null, `quote_error` dice por
 * qué y `cost` en null salvo que se haya elegido acordar. Así el checkout
 * puede ofrecer "acordar envío" en vez de bloquear el pago; createPaymentOrder
 * es el que se niega a cobrar con `cost` null.
 *
 * @param subtotal total de productos **con el cupón ya descontado**. Es el que
 *   corresponde: el descuento sale del mismo margen que paga el envío, así que
 *   medir el mínimo contra el precio de lista regalaría las dos cosas.
 * @param deliveryType lo que eligió el cliente; null = todavía no eligió, se
 *   cotiza como domicilio.
 */
const quoteShipping = async ({ address, subtotal = 0, items = [], deliveryType = null }) => {
  const caba = isCaba(address);
  const minPurchase = Number(subtotal) >= FREE_SHIPPING_MIN_PURCHASE;
  const freeReason = caba ? "caba" : minPurchase ? "min_purchase" : null;

  const type = DELIVERY_TYPES.includes(deliveryType) ? deliveryType : "D";

  const base = {
    free_reason: freeReason,
    delivery_type: type,
    options: null,
    packages: 0,
    valid_to: null,
    quote_error: null,
  };

  if (items.length === 0) {
    return { ...base, cost: 0, free: false, reason: null, quoted: false };
  }

  let quotes = null;
  let packages = [];

  try {
    const dims = await productRepository.findShippingDims(items.map((i) => i.id));
    packages = buildPackages(items, dims);
    quotes = await Promise.all(
      packages.map((bulto) => micorreo.rates(address.zip_code, bulto))
    );
  } catch (error) {
    console.error(`[envio] no se pudo cotizar con Correo (CP ${address?.zip_code}):`, error.message);
    base.quote_error = "No pudimos cotizar el envío con Correo Argentino.";
  }

  if (quotes) {
    const total = (key) => {
      if (quotes.some((q) => !q[key])) return null;
      const price = Math.round(quotes.reduce((t, q) => t + q[key].price, 0) * 100) / 100;
      return {
        price,
        // Lo que cotizó Correo, para mostrarlo tachado cuando sale gratis.
        list_price: price,
        days_min: Math.max(...quotes.map((q) => q[key].deliveryTimeMin ?? 0)) || null,
        days_max: Math.max(...quotes.map((q) => q[key].deliveryTimeMax ?? 0)) || null,
      };
    };

    const options = { D: total("D"), S: total("S") };

    if (options.D && caba) options.D.price = 0;
    if (options.S && freeReason) options.S.price = 0;

    base.options = options;
    base.packages = packages.length;
    base.valid_to = quotes.map((q) => q.validTo).filter(Boolean).sort()[0] ?? null;

    if (!options.D && !options.S) {
      base.quote_error = "Correo Argentino no hace envíos a ese código postal.";
    }
  }

  if (type === "A") {
    return { ...base, cost: 0, free: false, reason: null, quoted: Boolean(quotes) };
  }

  const chosen = base.options?.[type];

  if (!chosen) {
    return {
      ...base,
      cost: null,
      free: false,
      reason: null,
      quoted: false,
      quote_error:
        base.quote_error ??
        (type === "S"
          ? "Correo Argentino no tiene retiro en sucursal para ese código postal."
          : "Correo Argentino no hace envíos a domicilio a ese código postal."),
    };
  }

  return {
    ...base,
    cost: chosen.price,
    free: chosen.price === 0,
    // Por qué salió gratis lo elegido; null cuando se cobra.
    reason: chosen.price === 0 ? freeReason : null,
    quoted: true,
  };
};

const formatAddress = (address) =>
  `${address.address_name} ${address.address_number} ${
    address.department ? address.department : ""
  }, ${address.location}. ${address.province}. ${address.zip_code}`;

module.exports = {
  quoteShipping,
  formatAddress,
  isCaba,
  FREE_SHIPPING_MIN_PURCHASE,
};
