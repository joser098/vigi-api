const router = require("express").Router();
const searchRouter = require("./search.routes");
const customerRouter = require("./customer.routes");

//Routes
router.use("/search", searchRouter);
router.use("/customer", customerRouter);

module.exports = router;
