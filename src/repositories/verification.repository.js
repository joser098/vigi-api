const crypto = require("node:crypto");
const { query } = require("../db/client");
const { isUuid } = require("../db/uuid");

const create = async (customer_id, reason) => {
  const hash = crypto.randomUUID();

  await query(
    `insert into verification_hashes (hash, customer_id, reason)
     values ($1, $2, $3)`,
    [hash, customer_id, reason]
  );

  return hash;
};

// Non-destructive check, for screens that need to know a reset link is still
// good before showing the form.
const exists = async (hash) => {
  if (!isUuid(hash)) return false;

  const { rowCount } = await query(
    `select 1 from verification_hashes where hash = $1 and expires_at > now()`,
    [hash]
  );

  return rowCount > 0;
};

// Finds and deletes in one statement, so a hash cannot be redeemed twice by two
// concurrent requests. Expired hashes are treated as missing — the Mongo
// version had no expiry at all, and reset links stayed valid forever.
const consume = async (hash) => {
  if (!isUuid(hash)) return null;

  const { rows } = await query(
    `delete from verification_hashes
      where hash = $1 and expires_at > now()
     returning customer_id, reason`,
    [hash]
  );

  return rows[0] ?? null;
};

module.exports = { create, exists, consume };
