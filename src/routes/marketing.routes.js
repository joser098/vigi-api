const unsubscribe = require("../handlers/Marketing/unsubscribe.handler");

const marketingRouter = require("express").Router();

// Sin auth: el que se da de baja no tiene por qué tener sesión.
marketingRouter.post("/unsubscribe", unsubscribe);

module.exports = marketingRouter;
