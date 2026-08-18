const cotizadorAndreani = require("../../services/fetchThirdParty");

// Andreani quotes by destination zip code, so the quote still keys off the zip.
// What changed is the package.
//
// The catalogue has no height, width, length or weight per product, so every
// order is quoted with one fixed package. It used to be declared as 1x1x1 cm
// and 1000 g — smaller than anything we actually sell, which quoted well under
// what the shipment then costs us.
//
// These are a middle estimate across what we ship most: a single camera fits
// with room to spare, a kit with recorder and cable still falls short. Calibrate
// them against what Andreani ends up billing. The real fix is storing
// dimensions per product and building the package from the cart.
const BULTO_ESTANDAR = {
  altoCm: "20",
  anchoCm: "25",
  largoCm: "35",
  peso: "3500",
  unidad: "grs",
};

// Declared value: the cap Andreani covers if the parcel is lost. Once the cart
// total reaches this call it should be that total, not a flat number — today a
// $400.000 camera travels covered for $30.000.
const VALOR_DECLARADO = "30000";

// The three item sizes Andreani defines for this account. We quote with the
// first one; worth checking against their docs whether a larger one matches
// BULTO_ESTANDAR better.
const ANDREANI_ITEM_IDS = [
  "9a4edc9d-1299-41fb-8f9d-b268cabcb5f3",
  "8409e239-b1c4-41bd-bfc2-4f019f152b75",
  "14317f1a-9818-4352-8d8b-8250d5981abc",
];

const TIPO_DE_ENVIO_ID = "9c16612c-a916-48cf-9fbb-dbad2b097e9e";
const CP_ORIGEN = "1704";

const _getShippingCostsByAddress = async (zip_code) => {
  const andreaniPayload = {
    codigoPostalOrigen: CP_ORIGEN,
    codigoPostalDestino: zip_code,
    tipoDeEnvioId: TIPO_DE_ENVIO_ID,
    bultos: [
      {
        itemId: ANDREANI_ITEM_IDS[0],
        ...BULTO_ESTANDAR,
        valorDeclarado: VALOR_DECLARADO,
      },
    ],
  };

  const shippingCost = await cotizadorAndreani(andreaniPayload);

  // Same tariff as always, but say why when the response doesn't have that
  // shape: this used to blow up as "cannot read property of undefined".
  const tarifa = Array.isArray(shippingCost) ? shippingCost[1] : undefined;

  if (!tarifa || typeof tarifa.tarifaConIva !== "number") {
    throw new Error(
      `Andreani returned no usable tariff for zip ${zip_code}`
    );
  }

  return tarifa.tarifaConIva;
};

module.exports = _getShippingCostsByAddress;
