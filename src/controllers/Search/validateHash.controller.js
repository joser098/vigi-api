const db_conn = require("../../services/db_conn");

const _validateHash = async (hash) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_VERIFY_HASH
  );

  const result = await collection.findOne({ hash });

  if (result) {
    return true;
  }
  return false;
};

module.exports = _validateHash;
