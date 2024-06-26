const db_conn = require("../../services/db_conn");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const _updateLastLogin = require("./updateLastLogin.controller");

const _validateLogin = async (email, password) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const user_found = await collection.findOne({ email: email });

  if(!user_found){
    throw new Error(`No existe usuario con email: ${email}`)
  }

  if(!user_found.isActive){
    throw new Error("Correo electrónico no verificado")
  }

  const validatePassword = !user_found
    ? false
    : await bcrypt.compare(password, user_found.password);

  if (!(user_found && validatePassword)) {
    throw new Error("Correo o contraseña incorrectos");
  }

  const token = await jwt.sign(user_found, process.env.JWT_SECRET);
  _updateLastLogin(user_found._id);
  
  return {
    access: true,
    token: token,
  };
};
module.exports = _validateLogin;
