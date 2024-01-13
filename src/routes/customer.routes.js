const registerCustomer = require("../handlers/Customer/registerCustomer.handler");

const customerRouter = require("express").Router();

customerRouter.post("/", registerCustomer);

module.exports = customerRouter;
