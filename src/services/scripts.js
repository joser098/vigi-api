const formatPrice = (price, discount) => {
  const price_original = price;
  const price_discount = price - (price * discount) / 100;
  const price_diferred = price - price_discount;

  return {
    price_original,
    price_discount,
    price_diferred
  }
};

module.exports = { formatPrice };