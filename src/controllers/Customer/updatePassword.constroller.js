const bcrypt = require("bcrypt");
const db_conn = require("../../services/db_conn");
const { ObjectId } = require("mongodb");

const _updatePassword = async (customer_id, password) => {
  const saltRounds = 5;
  const hash = await bcrypt.hash(password, saltRounds);

  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.updateOne(
    { _id: new ObjectId(customer_id) },
    { $set: { password: hash } }
  );

  if (result.acknowledged && result.modifiedCount == 1) {
    return true;
  }
  return false;
};

module.exports = _updatePassword;
