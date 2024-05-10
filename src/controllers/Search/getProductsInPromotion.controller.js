const db_conn = require("../../services/db_conn");

const _getProuctsInPromotion = async () => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.find({ has_promotion: true }, { sort: { price: 1 } }).toArray();

  return result;
};
module.exports = _getProuctsInPromotion;
