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
      // El customer_id viajaba SOLO acá, escondido en el apellido del pagador,
      // y de ahí lo sacaba el webhook. Es frágil: es un campo de nombre y MP no
      // garantiza devolver `additional_info`. Ahora va también en `metadata`,
      // que es el canal que MP tiene para esto, y el webhook lee de ahí
      // primero. El surname se mantiene para no romper los pagos ya creados.
      metadata: {
        customer_id: payer.id,
        cart_id: payer.cart_id ?? null,
      },
      payer: {
        name: payer.user_data.name,
        surname: payer.id,
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
