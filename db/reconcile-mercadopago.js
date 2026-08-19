/**
 * Conciliación con Mercado Pago: la red de abajo de todo.
 *
 * Busca en MP los pagos aprobados de los últimos N días y registra los que no
 * tengan orden. Existe porque un webhook siempre se puede perder —y ya se
 * perdió uno— y porque nadie debería enterarse de una venta faltante por un
 * cliente enojado.
 *
 *   node db/reconcile-mercadopago.js            # simulacro, no escribe nada
 *   node db/reconcile-mercadopago.js --apply    # registra lo que falte
 *   node db/reconcile-mercadopago.js --apply --days 30
 *
 * Conviene correrlo por cron una vez por día. Es idempotente: los pagos que ya
 * tienen orden los saltea sin tocar nada ni mandar mails de nuevo.
 */

require("dotenv").config();

const orderRepository = require("../src/repositories/order.repository");
const { recordMercadoPagoPayment } = require("../src/services/payments");
const { closeConnection } = require("../src/db/client");

const args = process.argv.slice(2);
const APLICAR = args.includes("--apply");
const DIAS = Number(args[args.indexOf("--days") + 1]) || 7;

const money = (n) =>
  Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });

const buscarPagos = async (desde) => {
  const url = new URL("https://api.mercadopago.com/v1/payments/search");
  url.searchParams.set("sort", "date_created");
  url.searchParams.set("criteria", "desc");
  url.searchParams.set("range", "date_created");
  url.searchParams.set("begin_date", desde.toISOString());
  url.searchParams.set("end_date", "NOW");
  url.searchParams.set("limit", "100");

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });

  if (!r.ok) {
    throw new Error(`MP respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  return (await r.json()).results ?? [];
};

(async () => {
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000);

  console.log(
    `Conciliando pagos de Mercado Pago desde ${desde.toISOString().slice(0, 10)} ` +
      `(${DIAS} días) — ${APLICAR ? "APLICANDO" : "simulacro, no escribe"}\n`
  );

  const pagos = await buscarPagos(desde);
  const aprobados = pagos.filter((p) => p.status === "approved");

  console.log(`${pagos.length} pagos en el período, ${aprobados.length} aprobados\n`);

  let faltantes = 0;
  let registrados = 0;

  for (const p of aprobados) {
    const orden = await orderRepository.findByPaymentId(p.id);
    if (orden) continue;

    faltantes++;
    const monto = p.transaction_details?.total_paid_amount ?? p.transaction_amount;
    console.log(`FALTA  pago ${p.id}  ${money(monto)}  ${p.date_approved}`);

    if (!APLICAR) continue;

    try {
      const r = await recordMercadoPagoPayment(p.id);
      if (r.order_created) {
        registrados++;
        console.log(`       -> orden creada`);
      } else {
        console.log(`       -> no se creó: ${r.reason ?? "ya existía"}`);
      }
    } catch (e) {
      console.log(`       -> ERROR: ${e.message}`);
    }
  }

  console.log(
    `\n${faltantes} pagos aprobados sin orden` +
      (APLICAR ? `, ${registrados} registrados ahora.` : ". Corré con --apply para registrarlos.")
  );

  await closeConnection();
})().catch(async (e) => {
  console.error("La conciliación falló:", e.message);
  await closeConnection();
  process.exit(1);
});
