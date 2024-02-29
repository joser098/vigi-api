const addProduct = require("../handlers/Cart/addProduct.handler");
const emptyCart = require("../handlers/Cart/emptyCart.hanlder");
const getCartById = require("../handlers/Cart/getCartById.handler");
const userAuth = require("../middlewares/userAuth");

const cartRouter = require("express").Router();

cartRouter.put("/add", userAuth, addProduct);
cartRouter.put("/empty/:id", emptyCart);
cartRouter.get("/:id", getCartById)

module.exports = cartRouter;
