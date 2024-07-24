const getDate = require("../../services/getDate");
const db_conn = require("../../services/db_conn");

const _savePaymentOrder = async (mp_payment, payment_nv) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.PAYMENT_ORDERS
  );

  if (payment_nv) {
    const result = await collection.updateOne(
      {order_id: payment_nv.order_id}, 
      { $set: payment_nv}, 
      { upsert: true });
    return result;
  }


  const paymentOrder = {
    id: mp_payment.id,
    status: mp_payment.status,
    status_detail: mp_payment.status_detail,
    additional_info: mp_payment.additional_info,
    date_approved: mp_payment.date_approved,
    date_created: mp_payment.date_created,
    date_last_updated: mp_payment.date_last_updated,
    description: mp_payment.description,
    operation_type: mp_payment.operation_type,
    payment_method: mp_payment.payment_method,
    card: mp_payment.card,
    cuotas: mp_payment.installments,
    authorization_code: mp_payment.authorization_code,
    transaction_details: mp_payment.transaction_details,
    payer: mp_payment.payer,
    money_details: {
      money_release_date: mp_payment.money_release_date,
      money_release_status: mp_payment.money_release_status,
      money_release_schema: mp_payment.money_release_schema,
    },
    order: mp_payment.order,
    point_of_interaction: mp_payment.point_of_interaction,
    charges_detail: mp_payment.charges_detail,
    fee_details: mp_payment.fee_details,
    refunds: mp_payment.refunds,
    marketplace_details: {
      marketplace_owner: mp_payment.marketplace_owner,
      merchant_account_id: mp_payment.merchant_account_id,
    },
    updatedAt: getDate(),
  };

  const result = await collection.updateOne(
    { id: mp_payment.id },
    { $set: paymentOrder },
    { upsert: true }
  );

  return result;
};
module.exports = _savePaymentOrder;
