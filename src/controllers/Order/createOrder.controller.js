const db_conn = require("../../services/db_conn");

const _createOrder = async (order) => {
  try {
    const collection = await db_conn(
      process.env.DB_NAME,
      process.env.DB_ORDERS
    );
    
    const result = await collection.updateOne(
      { payment_id: order.payment_id },
      { $set: order },
      { upsert: true }
    );

    return result;
  } catch (error) {
    console.log(error);
  }
};
module.exports = _createOrder;
