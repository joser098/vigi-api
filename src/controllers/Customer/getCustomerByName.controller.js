const db_conn = require("../../services/db_conn");

const _getCustomerByName = async (name) => {
  const regex = new RegExp(name, "i");

  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection
    .find({ "user_data.name": { $regex: regex } })
    .toArray();

  return result;
};
module.exports = _getCustomerByName;
