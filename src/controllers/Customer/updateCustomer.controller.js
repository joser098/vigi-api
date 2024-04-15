const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _updateCustomer = async (id, data) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const updateQuery = {};

  if (data.address) {
    updateQuery[`user_data.address`] = data.address;
  } else {
    for (const key in data) {
      updateQuery[`user_data.${key}`] = data[key];
    }
  }

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateQuery }
  );

  return result;
};
module.exports = _updateCustomer;
