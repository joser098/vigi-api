const { ObjectId } = require("mongodb");
const db_conn = require("../../services/db_conn");

const _getCartById = async (cart_id) => {
    const collection = await db_conn(process.env.DB_NAME, process.env.DB_CARTS);

    const result = await collection.findOne({_id: new ObjectId(cart_id)});

    return result;
};

module.exports = _getCartById;