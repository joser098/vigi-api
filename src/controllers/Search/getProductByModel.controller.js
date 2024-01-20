const db_conn = require("../../services/db_conn");

const _getProductByModel = async (model) => {
  const regex = new RegExp(model, "i");

  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.find({ model:{ $regex: regex }}).toArray();

  return result;
};
module.exports = _getProductByModel;