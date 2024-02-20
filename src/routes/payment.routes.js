const createPaymentOrder = require("../handlers/Payment/createPaymentOrder.handler");
const feedback = require("../handlers/Payment/feedback.handler");
const getPayment = require("../handlers/Payment/getPayment.handler");
const receiveWeebhook = require("../handlers/Payment/receiveWebhook.handler");

const paymentRouter = require("express").Router();

paymentRouter.post("/create", createPaymentOrder);
paymentRouter.post("/webhook", receiveWeebhook);
paymentRouter.get("/feedback", feedback);
paymentRouter.get("/:id", getPayment);

module.exports = paymentRouter;
