const registerCustomer = require("../handlers/Customer/registerCustomer.handler");
const getCustomer = require("../handlers/Customer/getCustomer.handler");
const login = require("../handlers/Customer/login.handler");
const updateCustomer = require("../handlers/Customer/updateCustomer.handler");
const userAuth = require("../middlewares/userAuth");

const customerRouter = require("express").Router();

customerRouter.post("/", registerCustomer);
customerRouter.get("/", userAuth, getCustomer);
customerRouter.post("/login", login);
customerRouter.patch("/:id", updateCustomer);

module.exports = customerRouter;
