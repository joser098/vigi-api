const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _getCustomerById = async (id) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.findOne({ _id: new ObjectId(id) });

  return result;
};
module.exports = _getCustomerById;
