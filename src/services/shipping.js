const _getShippingCostsByAddress = require("../controllers/Logistics/getShippingCostsByAddress.controller");

// CABA no cotiza: el envío es gratis por zona.
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
 * Envío gratis a todo el país a partir de este subtotal.
 *
 * De dónde sale el número. El margen de referencia es 30% sobre el costo, o sea
 * 23,1% sobre el precio de venta, y es uniforme: los 704 productos activos están
 * todos en ese margen, sin overrides. Descontando ~6% de comisión de pasarela
 * quedan 17,1 puntos de contribución para absorber el envío.
 *
 * Andreani, cotizado contra la tarifa que efectivamente se cobra (índice [1]),
 * origen CP 1704 y el bulto estándar de abajo:
 *
 *   AMBA                                  $18.774
 *   Rosario / Córdoba / Mar del Plata     $26.725
 *   Mendoza / Neuquén / Tucumán           $31.765
 *   Salta / Ushuaia / Río Gallegos        $38.063
 *
 * A $450.000 la contribución es ~$77.000 y el peor destino se lleva $38.000:
 * queda 8,6% neto en el caso más caro. A $250.000 quedaba 1,9%, que es
 * demasiado fino para el error que se explica acá abajo.
 *
 * EL AGUJERO QUE SIGUE ABIERTO: la cotización usa un paquete fijo de 3,5 kg
 * (ver getShippingCostsByAddress.controller), pero un kit real pesa 10 o 18 kg.
 * Ese mismo kit a Salta cotiza $120.800, así que ni siquiera $450.000 lo cubre.
 * No es un problema del envío gratis: los envíos pagos ya se están cotizando
 * por debajo del costo real. Se arregla guardando dimensiones por producto y
 * armando el bulto desde el carrito, no subiendo este número.
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
 * Cotiza el envío y explica por qué salió lo que salió.
 *
 * Los dos casos gratuitos cortan **antes** de llamar a Andreani: si el destino
 * es CABA o la compra supera el mínimo, el resultado no depende de la tarifa,
 * así que pedirla sería esperar a un tercero para descartar la respuesta.
 *
 * @param subtotal total de productos **con el cupón ya descontado**. Es el que
 *   corresponde: el descuento sale del mismo margen que paga el envío, así que
 *   medir el mínimo contra el precio de lista regalaría las dos cosas.
 * @returns {{ cost: number, free: boolean, reason: string|null, quoted: boolean }}
 */
const quoteShipping = async (address, subtotal = 0) => {
  if (isCaba(address)) {
    return { cost: 0, free: true, reason: "caba", quoted: false };
  }

  if (Number(subtotal) >= FREE_SHIPPING_MIN_PURCHASE) {
    return { cost: 0, free: true, reason: "min_purchase", quoted: false };
  }

  const cost = await _getShippingCostsByAddress(address.zip_code);

  return { cost, free: false, reason: null, quoted: true };
};

// Shared by the logistics endpoint and by checkout, so a quote and the amount
// actually charged can never diverge.
const calculateShippingCost = async (address, subtotal = 0) =>
  (await quoteShipping(address, subtotal)).cost;

const formatAddress = (address) =>
  `${address.address_name} ${address.address_number} ${
    address.department ? address.department : ""
  }, ${address.location}. ${address.province}. ${address.zip_code}`;

module.exports = {
  quoteShipping,
  calculateShippingCost,
  formatAddress,
  isCaba,
  FREE_SHIPPING_MIN_PURCHASE,
};
