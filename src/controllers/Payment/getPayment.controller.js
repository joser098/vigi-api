// const { Payment, MercadoPagoConfig } = require("mercadopago");

const db_conn = require("../../services/db_conn");

const _getPayment = async (id) => {
    // const client = new MercadoPagoConfig({
    //     accessToken: process.env.MP_ACCESS_TOKEN,
    //   });
    //   const mp_payment = new Payment(client);
  
    //   const payment = await mp_payment.get({
    //       id
    //   });

    //   return payment;

    const collection = await db_conn(process.env.DB_NAME,process.env.PAYMENT_ORDERS);

    const result = await collection.findOne({id: Number(id)})

    return result;
};

module.exports = _getPayment;