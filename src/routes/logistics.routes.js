const userAuth = require("../middlewares/userAuth");
const getShippingCosts = require("../handlers/Logistics/getShippingCosts.handler");
const getAgencies = require("../handlers/Logistics/getAgencies.handler");

const logisticRouter = require("express").Router();

logisticRouter.get("/cost", userAuth, getShippingCosts);
// Sucursales de Correo Argentino para el retiro, según la dirección del cliente.
logisticRouter.get("/agencies", userAuth, getAgencies);

module.exports = logisticRouter;
