const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _emptyCart = async (id) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_CARTS);

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: { items: [], products_total: 0, amount_to_pay: 0 },
    }
  );

  return result;
};
module.exports = _emptyCart;
