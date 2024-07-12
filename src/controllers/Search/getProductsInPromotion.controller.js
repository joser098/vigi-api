const db_conn = require("../../services/db_conn");

const _getProuctsInPromotion = async (order) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

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

  const result = await collection
    .find({ has_promotion: true, is_active: true })
    .sort(orderQuery)
    .toArray();

  return result;
};
module.exports = _getProuctsInPromotion;
