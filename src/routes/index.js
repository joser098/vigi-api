const router  = require("express").Router();
const searchRouter = require('./Search/search.routes');

//Routes
router.use("/search", searchRouter);

module.exports = router;
