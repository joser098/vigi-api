const addProduct = require("../handlers/Cart/addProduct.handler");
const emptyCart = require("../handlers/Cart/emptyCart.hanlder");
const getCartById = require("../handlers/Cart/getCartById.handler");

const cartRouter = require("express").Router();

cartRouter.put("/add", addProduct);
cartRouter.put("/empty/:id", emptyCart);
cartRouter.get("/:id", getCartById)

module.exports = cartRouter;
