const createPaymentOrder = require("../handlers/Payment/createPaymentOrder.handler");
const feedback = require("../handlers/Payment/feedback.handler");
const receiveWeebhook = require("../handlers/Payment/receiveWebhook.handler");

const paymentRouter = require("express").Router();

paymentRouter.post("/create", createPaymentOrder);
paymentRouter.post("/webhook", receiveWeebhook);
paymentRouter.get("/feedback", feedback);

module.exports = paymentRouter;
