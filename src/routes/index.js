const { Router } = require("express");
const router = Router();

//Routes
router.use("/ping", async (req, res) => {
  res.send("pong");
});

module.exports = router;
