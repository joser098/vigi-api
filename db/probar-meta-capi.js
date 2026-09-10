/**
 * Mandar a mano el Purchase de un pago que ya existe, para ver la API de
 * Conversiones funcionando sin tener que comprar de nuevo.
 *
 * Existe porque la compra de prueba se hizo dos veces —Chrome y Edge— y ninguna
 * llegó a Meta: los dos navegadores bloquean el píxel de fábrica. Desde acá el
 * evento sale del servidor, que es justamente el punto.
 *
 *   node db/probar-meta-capi.js 178312569198            # va al Probador de eventos
 *   node db/probar-meta-capi.js 178312569198 --real     # cuenta como conversión
 *
 * Sin `--real` exige que esté puesta META_CAPI_TEST, el código que da el
 * Administrador de eventos en la pestaña "Probar eventos". Así el evento
 * aparece ahí y no ensucia las estadísticas.
 *
 * Repetirlo no infla nada: el `event_id` es `purchase_<id del pago>`, siempre
 * el mismo, así que Meta cuenta una sola compra por más veces que se mande.
 */

require("dotenv").config();

const { MercadoPagoConfig, Payment } = require("mercadopago");
const customerRepository = require("../src/repositories/customer.repository");
const { enviarCompra } = require("../src/services/metaCapi");
const { customerIdDe } = require("../src/utils/mpPayment");
const { closeConnection } = require("../src/db/client");

const args = process.argv.slice(2);
const REAL = args.includes("--real");
const paymentId = args.find((a) => !a.startsWith("--"));

const salir = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};

const main = async () => {
  if (!paymentId) {
    salir("Falta el id del pago.\n  node db/probar-meta-capi.js 178312569198");
  }

  if (!process.env.META_DATASET_ID || !process.env.META_CAPI_TOKEN) {
    salir(
      "Faltan META_DATASET_ID o META_CAPI_TOKEN.\n" +
        "El token se genera en el Administrador de eventos, en Configuración,\n" +
        "en la sección de la API de conversiones."
    );
  }

  if (!REAL && !process.env.META_CAPI_TEST) {
    salir(
      "Sin META_CAPI_TEST el evento contaría como una conversión real.\n" +
        "Poné el código del Probador de eventos, o usá --real si es lo que querés."
    );
  }

  const payment = await new Payment(
    new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
  ).get({ id: String(paymentId) });

  console.log(
    `pago ${payment.id}: ${payment.status} · $${
      payment.transaction_details?.total_paid_amount ?? payment.transaction_amount
    }`
  );

  if (payment.status !== "approved") {
    salir(`El pago está en "${payment.status}". Meta solo debería ver los aprobados.`);
  }

  const customer_id = customerIdDe(payment);
  const customer = customer_id ? await customerRepository.findById(customer_id) : null;

  if (!customer) {
    console.warn("Sin cliente en la base: el evento va con menos datos para emparejar.");
  }

  const resultado = await enviarCompra({
    paymentId: payment.id,
    valor:
      payment.transaction_details?.total_paid_amount ?? payment.transaction_amount,
    items: payment.additional_info?.items ?? payment.items ?? [],
    customer,
    ip: payment.additional_info?.ip_address ?? null,
    fechaAprobado: payment.date_approved ?? null,
  });

  if (!resultado.enviado) {
    salir(`No se envió: ${resultado.motivo}`);
  }

  console.log(
    process.env.META_CAPI_TEST && !REAL
      ? "\nListo. Miralo en el Administrador de eventos → Probar eventos."
      : "\nListo. Va a aparecer en Información general en menos de 30 minutos."
  );
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => closeConnection());
