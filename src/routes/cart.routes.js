const addProduct = require("../handlers/Cart/addProduct.handler");
const emptyCart = require("../handlers/Cart/emptyCart.hanlder");
const getCartById = require("../handlers/Cart/getCartById.handler");
const applyCoupon = require("../handlers/Cart/applyCoupon.handler");
const removeCoupon = require("../handlers/Cart/removeCoupon.handler");
const setDelivery = require("../handlers/Cart/setDelivery.handler");
const userAuth = require("../middlewares/userAuth");

const cartRouter = require("express").Router();

cartRouter.put("/add", userAuth, addProduct);
cartRouter.put("/empty", userAuth, emptyCart);
cartRouter.get("/", userAuth, getCartById)

// El cupón es del carrito, no de la sesión del navegador: se guarda acá para
// que el checkout lo vuelva a validar sin confiar en el request.
cartRouter.post("/coupon", userAuth, applyCoupon);
cartRouter.delete("/coupon", userAuth, removeCoupon);
cartRouter.put("/delivery", userAuth, setDelivery);

module.exports = cartRouter;
