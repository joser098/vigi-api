const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");
const getDate = require("../../services/getDate");

const _updateLastLogin = async (id) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const date = getDate();

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { last_login: date } }
  );
};

module.exports = _updateLastLogin;
