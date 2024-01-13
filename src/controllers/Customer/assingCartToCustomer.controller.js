const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _assignCartToCustomer = async (customer_id, cart_id) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.updateOne(
    { _id: new ObjectId(customer_id) },
    { $set: { cart_id: new ObjectId(cart_id) } }
  );

  return result;
};

module.exports = _assignCartToCustomer;
