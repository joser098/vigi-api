const z = require('zod');

// Must match the codes seeded into order_statuses.
const orderStatusSchema = z.enum([
   "recibido",
   "en_preparacion",
   "enviado",
   "entregado",
]);

// Includes the browse facets, which the endpoint accepts as a category param
// even though they resolve against their own columns.
const categoryProductSchema = z.enum([
   "camaras",
   "alarmas",
   "almacenamiento",
   "kits",
   "porteros",
   "interior",
   "exterior",
   "batería",
   "análogas",
]);

const validateOrderStatus = (status) => {
   return orderStatusSchema.safeParse(status);
};

const validateCategoryProduct = (category) => {
   return categoryProductSchema.safeParse(category);
};

module.exports = {
   validateOrderStatus,
   validateCategoryProduct
};
