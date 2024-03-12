const router = require("express").Router();
const searchRouter = require("./search.routes");
const customerRouter = require("./customer.routes");
const cartRouter = require("./cart.routes");
const paymentRouter = require("./payment.routes");
const logisticRouter = require("./logistics.routes");

//Routes
router.use("/search", searchRouter);
router.use("/customer", customerRouter);
router.use("/cart", cartRouter);
router.use("/payment", paymentRouter);
router.use("/logistic", logisticRouter);

module.exports = router;
