const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _updateProfileImage = async (id, url) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const result = await collection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { profile_image: url } }
  );

  return result;
};

module.exports = _updateProfileImage;
