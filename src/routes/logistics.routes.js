const userAuth = require("../middlewares/userAuth");
const getShippingCosts = require("../handlers/Logistics/getShippingCosts.handler");

const logisticRouter = require("express").Router();

logisticRouter.get("/cost", userAuth,getShippingCosts);

module.exports = logisticRouter;
