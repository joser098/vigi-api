const db_conn = require("../../services/db_conn");

const _getCustomerOrders = async (customerId) => {
    const collection = await db_conn(process.env.DB_NAME, process.env.DB_ORDERS);

    const result = await collection.find({ customer_id: customerId }).toArray();

    return result;
};

module.exports = _getCustomerOrders;
