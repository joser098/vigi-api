const getAllOrders = require("../../handlers/Search/getAllOrders.handler");

const searchRouter = require("express").Router();

//Orders
searchRouter.get("/getAllOrders", getAllOrders);

module.exports = searchRouter;
