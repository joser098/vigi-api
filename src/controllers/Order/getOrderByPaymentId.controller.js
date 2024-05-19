const db_conn = require("../../services/db_conn");

const _getOrderByPaymentId = async (id) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_ORDERS);

  const result = await collection.findOne({ payment_id: id });

  return result;
};

module.exports = _getOrderByPaymentId;
