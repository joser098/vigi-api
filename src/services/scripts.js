// Pricing and category filtering used to live here. Both moved into SQL:
// the discounted price is a generated column on products, and the browse
// facets resolve against their own columns in product.repository.js.

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

module.exports = { formatItemsToNaveBody };
