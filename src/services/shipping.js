const _getShippingCostsByAddress = require("../controllers/Logistics/getShippingCostsByAddress.controller");

// Only CABA ships free.
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

const isFreeShipping = (address) =>
  CABA_ALIASES.has(normalize(address?.province));

// Shared by the logistics endpoint and by checkout, so a quote and the amount
// actually charged can never diverge.
const calculateShippingCost = async (address) => {
  if (isFreeShipping(address)) return 0;

  return _getShippingCostsByAddress(address.zip_code);
};

const formatAddress = (address) =>
  `${address.address_name} ${address.address_number} ${
    address.department ? address.department : ""
  }, ${address.location}. ${address.province}. ${address.zip_code}`;

module.exports = { calculateShippingCost, formatAddress, isFreeShipping };
