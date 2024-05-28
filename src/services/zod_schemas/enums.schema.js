const z = require('zod');

const orderStatusSchema = z.enum(["recibido", "en preparacion", "enviado", "entregado"]);
const categoryProductSchema = z.enum(["interior", "exterior", "batería", "alarmas", "camaras","almacenamiento", "kits", "porteros" ,"análogas"]);

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