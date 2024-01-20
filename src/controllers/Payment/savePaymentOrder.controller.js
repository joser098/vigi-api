const getDate = require("../../services/getDate");
const db_conn = require("../../services/db_conn");

const _savePaymentOrder = async ({
  additional_info,
  authorization_code,
  card,
  charges_detail,
  date_approved,
  date_created,
  date_last_updated,
  description,
  fee_details,
  id,
  installments,
  marketplace_owner,
  merchant_account_id,
  money_release_date,
  money_release_schema,
  money_release_status,
  operation_type,
  order,
  payer,
  payment_method,
  point_of_interaction,
  refunds,
  status,
  status_detail,
  transaction_details,
}) => {
  const collection = await db_conn(
    process.env.DB_NAME,
    process.env.PAYMENT_ORDERS
  );

  const paymentOrder = {
    id,
    status,
    status_detail,
    additional_info,
    date_approved,
    date_created,
    date_last_updated,
    description,
    operation_type,
    payment_method,
    card,
    cuotas: installments,
    authorization_code,
    transaction_details,
    payer,
    money_details: {
      money_release_date,
      money_release_status,
      money_release_schema,
    },
    order,
    point_of_interaction,
    charges_detail,
    fee_details,
    refunds,
    marketplace_details: {
      marketplace_owner,
      merchant_account_id,
    },
    updatedAt: getDate(),
  };

  const result = await collection.updateOne(
    { id: id },
    { $set: paymentOrder },
    { upsert: true }
  );

  return result;
};
module.exports = _savePaymentOrder;
