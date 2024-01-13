const getAllOrders = require("../../handlers/Search/getAllOrders.handler");
const getAllProducts = require("../../handlers/Search/getAllProducts.handler");
const getOrderById = require("../../handlers/Search/getOrderById.handler");
const getOrderByStatus = require("../../handlers/Search/getOrderByStatus.handler");
const getProduct = require("../../handlers/Search/getProduct.handler");
const getProducts = require("../../handlers/Search/getProducts.handler");

const searchRouter = require("express").Router();

//Orders
searchRouter.get("/getAllOrders", getAllOrders);
searchRouter.get("/getOrder", getOrderById);
searchRouter.get("/getOrderByStatus", getOrderByStatus);

//Products
searchRouter.get("/getAllProducts", getAllProducts);
searchRouter.get("/getProduct", getProduct);
searchRouter.get("/getProducts", getProducts)

module.exports = searchRouter;
