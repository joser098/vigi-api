const z = require('zod');

const orderStatusSchema = z.enum(["recibido", "en preparacion", "enviado", "entregado"]);
const categoryProductSchema = z.enum(["alarmas", "camaras", "dvr", "almacenamiento", "kits","otros"]);

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