const crypto = require("node:crypto");
const db_conn = require("../../services/db_conn");

const _createEmailVerificationHash = async (customer_id, reason) => {
  const hash = crypto.randomUUID();

  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.DB_VERIFY_HASH
  );

  const model = {
    hash,
    customer_id,
    reason
  }

  const result = await collection.insertOne(model);

  return hash;
};

module.exports = _createEmailVerificationHash;