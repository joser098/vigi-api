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

  return {category: category, is_active: true };
}


function setPromotionsToProduct(product) {
  if(product.has_promotion && product.discount > 0 && product.discount < 51){
    const price_formated = formatPrice(product.price, product.discount);

    product.price = parseInt(price_formated.price_discount);
    product.price_diferred = price_formated.price_diferred;
    product.price_original = price_formated.price_original;
  }
}

function formatItemsToNaveBody (products) {
  return products.map(product => {
    return {
      id: product.id,
      name: product.title,
      description: product.title,
      quantity: product.quantity,
      unit_price: {
        currency: "ARS",
        value: product.unit_price.toString(),
      } 
    }
  })
}

module.exports = { formatPrice, formatCategoryQuery, setPromotionsToProduct, formatItemsToNaveBody };