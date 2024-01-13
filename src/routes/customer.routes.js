const customerRouter = require("express").Router();

customerRouter.get("/", (req, res) => {
  res.send("POST HTTP method on customer resource");
});

module.exports = customerRouter;
