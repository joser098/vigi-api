const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _validateEmailWithHash = async (hash, setActive = false) => {
  const hash_collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_VERIFY_HASH
  );
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_CUSTOMERS
  );

  const hash_found = await hash_collection.findOne({ hash });

  if (hash_found) {
    if(setActive){
      let result = await collection.updateOne(
        { _id: new ObjectId(hash_found.customer_id) },
        { $set: { isActive: true } }
      );
  
      if (result.acknowledged) {
        await hash_collection.deleteOne({ hash });
        return true;
      }
    }

    await hash_collection.deleteOne({ hash });

    return {
      _result: true,
      customer_id: hash_found.customer_id,
    };
  }

  return false;
};

module.exports = _validateEmailWithHash;
