const getAllProducts = require("../handlers/Search/getAllProducts.handler");
const getOrderById = require("../handlers/Search/getOrderById.handler");
const getOrderByStatus = require("../handlers/Search/getOrders.handler");
const getProduct = require("../handlers/Search/getProduct.handler");
const getProducts = require("../handlers/Search/getProducts.handler");
const getProvinces = require("../handlers/Search/getProvinces.handler");
const getSimilarProducts = require("../handlers/Search/getSimilarProducts.handler");
const getSuggest = require("../handlers/Search/getSuggest.handler");
const validateHash = require("../handlers/Search/validateHash.handler");
const searchEngine = require("../handlers/Search/searchEngine.handler");
const getCarruselImages = require("../handlers/Search/getCarruselImages.handler");

const searchRouter = require("express").Router();

//Orders
searchRouter.get("/getOrder", getOrderById);
searchRouter.get("/getOrders", getOrderByStatus);

//Products
searchRouter.get("/getAllProducts", getAllProducts);
searchRouter.get("/getProduct", getProduct);
searchRouter.get("/getProducts", getProducts);
searchRouter.get("/getSimilarProducts", getSimilarProducts);
searchRouter.get("/validate-hash/:hash", validateHash);
searchRouter.post("/suggest", getSuggest);
searchRouter.post("/", searchEngine);
searchRouter.get("/carrusel", getCarruselImages);

//Const data
searchRouter.get("/provinces", getProvinces);

module.exports = searchRouter;
