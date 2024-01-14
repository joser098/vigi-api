const db_conn = require("../../services/db_conn");

const _validateCustomerExists = async (data) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.findOne({ email: data.email });

  if (result) {
    const obj = {
      userFound: true,
      message: `Customer with email ${data.email} already exists`,
    };

    return obj;
  }

  return true;
};
module.exports = _validateCustomerExists;
