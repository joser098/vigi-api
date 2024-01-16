const registerCustomer = require("../handlers/Customer/registerCustomer.handler");
const getCustomer = require("../handlers/Customer/getCustomer.handler");
const login = require("../handlers/Customer/login.handler");

const customerRouter = require("express").Router();

customerRouter.post("/", registerCustomer);
customerRouter.get("/", getCustomer);
customerRouter.post("/login", login);

module.exports = customerRouter;
