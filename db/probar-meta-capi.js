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
 * Los datos salen de `payment_orders`, no de Mercado Pago. La primera versión
 * los pedía a MP y fallaba con "Payment not Found" cuando el `.env` local tenía
 * otras credenciales que las de producción. La fila ya tiene el estado, el
 * monto, los ítems y el cliente: pedirlos afuera era ir a buscar lo que ya
 * estaba adentro.
 *
 * Repetirlo no infla nada: el `event_id` es `purchase_<id del pago>`, siempre
 * el mismo, así que Meta cuenta una sola compra por más veces que se mande.
 */

require("dotenv").config();

const paymentRepository = require("../src/repositories/payment.repository");
const customerRepository = require("../src/repositories/customer.repository");
const { enviarCompra } = require("../src/services/metaCapi");
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
        "El token se genera con un usuario del sistema que tenga asignado el\n" +
        "conjunto de datos. Ver 00-EMPEZAR-ACA.md en vigi-marketing."
    );
  }

  if (!REAL && !process.env.META_CAPI_TEST) {
    salir(
      "Sin META_CAPI_TEST el evento contaría como una conversión real.\n" +
        "Poné el código del Probador de eventos, o usá --real si es lo que querés."
    );
  }

  const payment = await paymentRepository.findByGatewayPaymentId(paymentId);

  if (!payment) {
    salir(
      `No hay ningún pago con gateway_payment_id ${paymentId} en payment_orders.\n` +
        "Fijate que sea el id de Mercado Pago y no el id interno de la fila."
    );
  }

  const monto = payment.transaction_details?.total_paid_amount ?? payment.amount;

  console.log(`pago ${paymentId}: ${payment.status} · $${monto}`);

  if (payment.status !== "approved") {
    salir(`El pago está en "${payment.status}". Meta solo debería ver los aprobados.`);
  }

  const customer = payment.customer_id
    ? await customerRepository.findById(payment.customer_id)
    : null;

  if (!customer) {
    console.warn("Sin cliente en la base: el evento va con menos datos para emparejar.");
  }

  const resultado = await enviarCompra({
    paymentId,
    valor: monto,
    items: payment.raw?.additional_info?.items ?? payment.items ?? [],
    customer,
    ip: payment.raw?.additional_info?.ip_address ?? null,
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
