/**
 * Pegar una ruta a una URL base sin que quede un doble slash en el medio.
 *
 * Parece una pavada y costó caro. `MP_BACK_URL` estaba cargada con una barra al
 * final, y todo el código hacía `${process.env.MP_BACK_URL}/api/...`, así que
 * las URLs salían con `//api/...`. Express no matchea eso —`//api` es un
 * segmento vacío seguido de `api`, no la ruta `/api`— y devuelve 404.
 *
 * Lo que rompió:
 *
 *   notification_url  ->  MP recibía 404 en CADA notificación de pago
 *   back_urls         ->  el comprador volvía a "Cannot GET //api/payment/feedback"
 *   verificación mail ->  el link de "validá tu cuenta" no validaba nada
 *
 * Y no se arregla solo tocando la variable de entorno: la `notification_url` y
 * las `back_urls` quedan congeladas dentro de cada preferencia de Mercado Pago
 * en el momento de crearla, así que las que ya salieron siguen mandando el
 * doble slash. Para esas está el middleware de `app.js`, que colapsa las barras
 * repetidas antes de que la request llegue al router.
 *
 * Usar siempre esto para armar una URL a partir de una variable de entorno. Una
 * barra al final es un error de tipeo que nadie ve hasta que alguien paga.
 */
const joinUrl = (base, path = "") => {
  const izq = String(base ?? "").replace(/\/+$/, "");
  const der = String(path).replace(/^\/+/, "");

  return der ? `${izq}/${der}` : izq;
};

module.exports = { joinUrl };
