const registerCustomer = require("../handlers/Customer/registerCustomer.handler");
const getCustomer = require("../handlers/Customer/getCustomer.handler");

const customerRouter = require("express").Router();

customerRouter.post("/", registerCustomer);
customerRouter.get("/", getCustomer);

module.exports = customerRouter;
