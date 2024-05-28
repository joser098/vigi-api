const db_conn = require("../../services/db_conn");
const { formatCategoryQuery } = require("../../services/scripts");

const _getProductsByCategory = async (category) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const categoryQuery = formatCategoryQuery(category);

  const result = await collection.find(categoryQuery).toArray();
  return result;
};
module.exports = _getProductsByCategory;
