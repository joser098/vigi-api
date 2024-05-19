const { MercadoPagoConfig, Preference } = require("mercadopago");
const crypto = require("node:crypto");

const _createPaymentOrder = async (payer, items, shipments) => {
  // Agrega credenciales
  const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,
  });

  // Crea un objeto de preferencia
  const preference = new Preference(client);

  const result = await preference.create({
    body: {
      items: items,
      notification_url: `${process.env.MP_NOTIFICATION_URL}/api/payment/webhook`,
      back_urls: {
        success: `${process.env.MP_BACK_URL}/api/payment/feedback`,
        failure: `${process.env.MP_BACK_URL}/api/payment/feedback`,
        pending: `${process.env.MP_BACK_URL}/api/payment/feedback`,
      },
      auto_return: "approved",
      payment_methods: {
        installments: 1,
        excluded_payment_methods: [
          {
            id: "argencard",
            id: "cmr",
            id: "cordobesa",
          },
        ],
        excluded_payment_types: [
          {
            id: "ticket",
          },
        ],
      },
      payer: {
        name: payer.user_data.name,
        surname: payer._id,
        email: payer.email,
        address: {
          zip_code: payer.user_data.address.zip_code,
          street_name: payer.user_data.address.address_name,
          street_number: payer.user_data.address.address_number,
        }
      },
      shipments: shipments,
      statement_descriptor: "Vigi.cam",
      external_reference: `ER-${crypto.randomUUID()}`,
      binary_mode: true,
    },
  });

    return result;
};
module.exports = _createPaymentOrder;
