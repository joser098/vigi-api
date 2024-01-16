const bcrypt = require("bcrypt");
const db_conn = require("../../services/db_conn");
const getDate = require("../../services/getDate");

const _registerCustomer = async (data) => {
  const { username, email, password, name, last_name, address, phone, DNI } =
    data;

  const saltRounds = 5;
  const hash = await bcrypt.hash(password, saltRounds);

  const customer_model = {
    username,
    email,
    password: hash,
    user_data: {
      name,
      last_name,
      address,
      phone,
      DNI,
    },
    has_order_active: false,
    register_date: getDate(),
  };

  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.insertOne(customer_model);

  return result;
};

module.exports = _registerCustomer;
