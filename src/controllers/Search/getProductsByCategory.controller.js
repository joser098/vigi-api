const db_conn = require("../../services/db_conn");
const { formatCategoryQuery } = require("../../services/scripts");

const _getProductsByCategory = async (category, order) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const categoryQuery = formatCategoryQuery(category);
  function formatOrderQuery (){
    if(order === "asc"){
      return {price: 1};
    } else if (order === "desc"){
      return {price: -1};
    } else {
      return {};
    }
  }
  const orderQuery = formatOrderQuery();

  const result = await collection.find(categoryQuery).sort(orderQuery).toArray();
  return result;
};
module.exports = _getProductsByCategory;
