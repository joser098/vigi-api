const addProduct = require("../handlers/Cart/addProduct.handler");

const cartRouter = require("express").Router();

cartRouter.put("/add", addProduct);

module.exports = cartRouter;