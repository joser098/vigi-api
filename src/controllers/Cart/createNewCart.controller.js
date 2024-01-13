const db_conn = require("../../services/db_conn");

const _createNewCart = async (customer_id) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_CARTS);

  const cart_model = {
    customer_id,
    current_products_added: [],
    products_QTY: 0,
    amount_to_pay: 0,
  };

  const result = await collection.insertOne(cart_model);
  return result;
};

module.exports = _createNewCart;