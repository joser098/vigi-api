const cotizadorAndreani = require("../../services/fetchThirdParty");

const _getShippingCostsByAddress = async (zip_code) => {
  const shippingItemSize = [
    "9a4edc9d-1299-41fb-8f9d-b268cabcb5f3",
    "8409e239-b1c4-41bd-bfc2-4f019f152b75",
    "14317f1a-9818-4352-8d8b-8250d5981abc",
  ];

  const andreaniPayload = {
    codigoPostalOrigen: "1704",
    codigoPostalDestino: zip_code,
    tipoDeEnvioId: "9c16612c-a916-48cf-9fbb-dbad2b097e9e",
    bultos: [
      {
        itemId: "9a4edc9d-1299-41fb-8f9d-b268cabcb5f3",
        altoCm: "1",
        anchoCm: "1",
        largoCm: "1",
        peso: "1000",
        valorDeclarado: "30000",
        unidad: "grs",
      },
    ],
  };

  
  const shippingCost = await cotizadorAndreani(andreaniPayload);

  return shippingCost[1].tarifaConIva;
};

module.exports = _getShippingCostsByAddress;
