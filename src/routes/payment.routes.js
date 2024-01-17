const createPaymentOrder = require("../handlers/Payment/createPaymentOrder.handler");

const paymentRouter = require("express").Router();

paymentRouter.get("/", createPaymentOrder);

module.exports = paymentRouter;
