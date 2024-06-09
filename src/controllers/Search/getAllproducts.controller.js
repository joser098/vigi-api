const db_conn = require("../../services/db_conn");

const _getAllProducts = async () => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.find({is_active: true}).toArray();

  return result;
};
module.exports = _getAllProducts;
