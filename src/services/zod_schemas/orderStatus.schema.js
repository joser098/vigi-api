const z = require('zod');

const orderStatusSchema = z.enum(["recibido", "en preparacion", "enviado", "entregado"]);

const validateOrderStatus = (status) => {
   return orderStatusSchema.safeParse(status);
};

module.exports = validateOrderStatus;