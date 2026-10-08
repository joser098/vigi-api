/**
 * WhatsApp de atención (Kapso, ver kapso/README.md). El mismo número que
 * `vigi-app/src/services/contacto.ts`: si cambia allá, cambia acá.
 */
const WHATSAPP_URL = "https://wa.me/541126039243";

/**
 * Link para coordinar un pedido con "acordar envío". El texto es el que
 * reconoce `kapso/functions/vigi-entrada`: no cambiarlo sin cambiar aquel.
 */
const whatsappAcordar = (paymentId) =>
  `${WHATSAPP_URL}?text=${encodeURIComponent(
    `Hola! Quiero acordar el envío de mi pedido ${paymentId}`
  )}`;

module.exports = { WHATSAPP_URL, whatsappAcordar };
