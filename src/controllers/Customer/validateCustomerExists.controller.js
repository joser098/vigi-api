const db_conn = require("../../services/db_conn");

const _validateCustomerExists = async (data) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.findOne({ email: data.email }, { projection: { _id: 1, "user_data.name": 1 } });

  if (result) {
    const obj = {
      userFound: true,
      message: `Ya existe un usuario con este correo ${data.email}`,
      customer_id: result._id,
      name: result.user_data.name
    };

    return obj;
  }

  return false;
};
module.exports = _validateCustomerExists;
