const conn = require("../db");

const db_conn = async (db, collection) => {
  try {
    const _db = await conn(db);
    const _collection = await _db.collection(collection);

    return _collection;
  } catch (error) {
    return error;
  }
};
module.exports = db_conn;
