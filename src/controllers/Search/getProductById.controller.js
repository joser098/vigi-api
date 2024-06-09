const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _getProductById = async (id) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection.findOne({ _id: new ObjectId(id), is_active: true });

  return result;
};
module.exports = _getProductById;
