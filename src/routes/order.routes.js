const orderRouter = require('express').Router();
const getCustomerOrders = require('../handlers/Order/getCustomerOrders');
const userAuth = require('../middlewares/userAuth');

orderRouter.get('/customer', userAuth, getCustomerOrders);

module.exports = orderRouter;
