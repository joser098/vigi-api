const getAllOrders = require("../../handlers/Search/getAllOrders.handler");
const getOrderById = require("../../handlers/Search/getOrderById.handler");
const getOrderByStatus = require("../../handlers/Search/getOrderByStatus.handler");

const searchRouter = require("express").Router();

//Orders
searchRouter.get("/getAllOrders", getAllOrders);
searchRouter.get("/getOrder", getOrderById);
searchRouter.get("/getOrderByStatus", getOrderByStatus);

module.exports = searchRouter;
