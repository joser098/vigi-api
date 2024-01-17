const addProduct = require("../handlers/Cart/addProduct.handler");
const emptyCart = require("../handlers/Cart/emptyCart.hanlder");

const cartRouter = require("express").Router();

cartRouter.put("/add", addProduct);
cartRouter.put("/empty/:id", emptyCart);

module.exports = cartRouter;
