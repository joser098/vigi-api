const _getShippingCostsByAddress = require("../controllers/Logistics/getShippingCostsByAddress.controller");

// CABA and Gran Buenos Aires ship free.
const FREE_SHIPPING_ZIP_PREFIXES = ["10", "11", "12", "14"];

// Shared by the logistics endpoint and by checkout, so a quote and the amount
// actually charged can never diverge.
const calculateShippingCost = async (address) => {
  const isFree = FREE_SHIPPING_ZIP_PREFIXES.some((prefix) =>
    address.zip_code.startsWith(prefix)
  );

  if (isFree) return 0;

  return _getShippingCostsByAddress(address.zip_code);
};

const formatAddress = (address) =>
  `${address.address_name} ${address.address_number} ${
    address.department ? address.department : ""
  }, ${address.location}. ${address.province}. ${address.zip_code}`;

module.exports = { calculateShippingCost, formatAddress };
