const router = require("express").Router();
const searchRouter = require("./search.routes");
const customerRouter = require("./customer.routes");
const cartRouter = require("./cart.routes");
const paymentRouter = require("./payment.routes");

//Routes
router.use("/search", searchRouter);
router.use("/customer", customerRouter);
router.use("/cart", cartRouter);
router.use("/payment", paymentRouter);

module.exports = router;
