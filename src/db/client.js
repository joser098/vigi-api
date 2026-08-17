const pg = require("pg");
const { Pool } = pg;

// numeric/decimal arrives as a string by default so no precision is lost. The
// API has always sent prices as JSON numbers, so it is parsed back to float
// here. If money ever needs exact arithmetic, do it in SQL, not in JS.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) =>
  value === null ? null : parseFloat(value)
);

let pool = null;

const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase requires TLS. Its pooler presents a certificate Node does not
      // chain to a trusted root, so verification is off. Tighten by shipping
      // the Supabase CA and setting `ca` instead.
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
};

const query = (text, params) => getPool().query(text, params);

// Runs fn inside BEGIN/COMMIT on a single dedicated connection, rolling back on
// throw. fn receives that connection: every query inside must use it, not
// `query()`, or it runs outside the transaction.
const withTransaction = async (fn) => {
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const closeConnection = async () => {
  if (!pool) return;

  const closing = pool;
  pool = null;

  await closing.end();
};

module.exports = { getPool, query, withTransaction, closeConnection };
