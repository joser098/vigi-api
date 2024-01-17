const router = require("express").Router();
const searchRouter = require("./search.routes");
const customerRouter = require("./customer.routes");
const cartRouter = require("./cart.routes");

//Routes
router.use("/search", searchRouter);
router.use("/customer", customerRouter);
router.use("/cart", cartRouter);

module.exports = router;
