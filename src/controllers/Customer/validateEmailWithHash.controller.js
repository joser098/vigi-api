const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _validateEmailWithHash = async (hash) => {
  const hash_collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_VERIFY_HASH
  );
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const hash_found = await hash_collection.findOne({ hash });

  if(hash_found._id){
    let result = await collection.updateOne(
      {_id: new ObjectId(hash_found.customer_id)},
      { $set: { isActive: true }}
    )

    if(result.acknowledged) return true;
  }

  return false;
};

module.exports = _validateEmailWithHash;
