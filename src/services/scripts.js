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

function formatCategoryQuery(category) {
  if (category == "interior" || category == "exterior") {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    return {"details.location": capitalizedCategory };
    
  };

  if(category == "batería"){
    return {"details.power_type": {
      $regex: "Bateria",
      $options: "i"
    }}
  };

  if(category == "análogas"){
    return {"details.anlogue": true}
  }

  return {category: category };
}

module.exports = { formatPrice, formatCategoryQuery };