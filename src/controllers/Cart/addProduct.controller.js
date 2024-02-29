const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _addProduct = async ({
  cart_id,
  items,
  products_total,
  amount_to_pay,
}) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_CARTS);

  const result = await collection.updateOne(
    {
      _id: new ObjectId(cart_id),
    },
    {
      $set: {
        items: items,
        products_total,
        amount_to_pay,
      },
    }
  );

  return result;
};
module.exports = _addProduct;
