const orderRouter = require('express').Router();
const getCustomerOrders = require('../handlers/Order/getCustomerOrders');
const getAcordarStatus = require('../handlers/Order/getAcordarStatus.handler');
const userAuth = require('../middlewares/userAuth');

orderRouter.get('/customer', userAuth, getCustomerOrders);
// Público: lo consulta el flujo de WhatsApp. Devuelve solo si el pedido es de
// "acordar envío", nada del cliente.
orderRouter.get('/acordar/:payment_id', getAcordarStatus);

module.exports = orderRouter;
