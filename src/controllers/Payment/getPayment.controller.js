const db_conn = require("../../services/db_conn");

const _getPayment = async (id, order_id) => {
    const collection = await db_conn(process.env.DB_NAME,process.env.PAYMENT_ORDERS);

    let result;
    if(id) {
        result = await collection.findOne({id: Number(id)})
    } else {
        result = await collection.findOne({ order_id })
    } 

    return result;
};

module.exports = _getPayment;