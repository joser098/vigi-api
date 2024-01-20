const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const addOrderToCustomer = async (customer_id) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.updateOne(
    { _id: new ObjectId(customer_id) },
    { $set: { has_order_active: true } }
  );

  return result;
};

module.exports = addOrderToCustomer;
