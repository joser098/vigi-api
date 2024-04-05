const db_conn = require("../../services/db_conn")

const _getProvinces = async () => {
    const collection = await db_conn(process.env.DB_NAME, process.env.DB_PROVINCES);

    const result = await collection.find({}).toArray();

    return result;
};

module.exports = _getProvinces;