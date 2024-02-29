const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const { authorization } = req.headers;

  let token = null;

  if (authorization && authorization.toLowerCase().startsWith("bearer")) {
    token = authorization.substring(7);
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const { _id, cart_id } = decodedToken;
    console.log(_id, cart_id);
    req.body.customer_id = _id;
    req.body.cart_id = cart_id;
  } catch (error) {
    return res
      .status(401)
      .json({ error: "Debe proveer un token o el mismo no es valido" });
  }

  next();
};
