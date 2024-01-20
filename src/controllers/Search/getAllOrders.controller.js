const db_conn = require("../../services/db_conn");

const _getAllOrders = async () => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_ORDERS);

  const result = await collection.find({}).toArray();

  return result;
}
module.exports = _getAllOrders;
