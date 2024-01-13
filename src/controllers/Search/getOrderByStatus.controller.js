const db_conn = require("../../services/db_conn");

const _getOrderByStatus = async (status) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_ORDERS);

  const result = await collection.find({ status: status }).toArray();

  return result;
};

module.exports = _getOrderByStatus;
