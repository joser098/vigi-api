const db_conn = require("../../services/db_conn");

const _getProductsByCategory = async (category) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.find({ category: category }).toArray();

  return result;
};
module.exports = _getProductsByCategory;
