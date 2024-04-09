const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _updateFavorite = async (product_id, customer_id, action) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  let updateQuery = {};
  if (action === "add") {
    updateQuery = { $addToSet: { favorites: customer_id } }; 
  } else if (action === "remove") {
    updateQuery = { $pull: { favorites: customer_id } };
  }

  const result = await collection.updateOne(
    { _id: new ObjectId(product_id) },
    updateQuery
  );

  return result;
};

module.exports = _updateFavorite;
