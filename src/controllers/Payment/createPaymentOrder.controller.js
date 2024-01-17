const { MercadoPagoConfig, Preference } = require("mercadopago");

const _createPaymentOrder = async (items) => {
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
    },
  });

    return result;
};
module.exports = _createPaymentOrder;
