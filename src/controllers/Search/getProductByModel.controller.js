const db_conn = require("../../services/db_conn");

const _getProductByModel = async (model) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.findOne({ model: model });

  return result;
};
module.exports = _getProductByModel;
