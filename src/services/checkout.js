const couponRepository = require("../repositories/coupon.repository");
const { evaluateCoupon, toPublic } = require("./coupons");
const { quoteShipping } = require("./shipping");

const round = (amount) => Math.round(amount * 100) / 100;

const sumItems = (items) =>
  round(items.reduce((total, i) => total + i.unit_price * i.quantity, 0));

/**
 * Reparte el descuento del cupón entre los ítems, proporcional a lo que pesa
 * cada uno.
 *
 * Hace falta porque Mercado Pago arma el total sumando los ítems de la
 * preferencia: no hay campo de descuento ni se aceptan importes negativos, así
 * que la única forma de que el cliente pague menos es que los ítems valgan
 * menos. Nave recibe el total aparte, pero le mandamos los mismos ítems para
 * que las dos pasarelas cuenten la misma historia.
 *
 * El total resultante se recalcula desde los ítems ya redondeados, así que no
 * puede quedar descuadrado contra lo que se cobra.
 */
const applyDiscountToItems = (items, discount) => {
  const total = sumItems(items);

  if (discount <= 0 || total <= 0) return items;

  const factor = Math.max(total - discount, 0) / total;

  return items.map((item) => ({
    ...item,
    unit_price: round(item.unit_price * factor),
  }));
};

/**
 * Los números de una compra, calculados en un solo lugar.
 *
 * Lo llaman el cotizador de envío (para mostrar) y `createPaymentOrder` (para
 * cobrar). Que sean la misma función es el punto: si el carrito dijera un total
 * y el checkout cobrara otro, el que se entera es el cliente.
 *
 * Nada de esto sale del request. Los precios vienen del carrito en la base y el
 * cupón se vuelve a validar acá, así que un cupón que venció entre que se
 * aplicó y que se pagó no se cobra con descuento: se cae solo y el total sube.
 */
const buildTotals = async ({ cart, customer_id, address }) => {
  const items = cart.items ?? [];
  const itemsTotal = sumItems(items);

  let coupon = null;
  let couponId = null;
  let couponError = null;
  let descuentoPedido = 0;

  if (cart.coupon) {
    const customerRedemptions =
      await couponRepository.countRedemptionsByCustomer(
        cart.coupon.id,
        customer_id
      );

    const resultado = evaluateCoupon(cart.coupon, {
      subtotal: itemsTotal,
      customerRedemptions,
    });

    if (resultado.valid) {
      descuentoPedido = resultado.discount;
      couponId = cart.coupon.id;
    } else {
      couponError = resultado.message;
    }
  }

  const discountedItems = applyDiscountToItems(items, descuentoPedido);

  // Sobre este número se mide el mínimo de envío gratis y se cobra la compra.
  // Sale de los ítems ya redondeados y no del descuento teórico, para que el
  // subtotal sea exactamente lo que suman los ítems que ve la pasarela.
  const subtotal = sumItems(discountedItems);
  const discount = round(itemsTotal - subtotal);

  if (cart.coupon && couponId) coupon = toPublic(cart.coupon, discount);

  // Retiro en oficina: no hay envío que cotizar ni tarifa que cobrar.
  const shipping = cart.local_pickup
    ? { cost: 0, free: true, reason: "local_pickup", quoted: false }
    : address
    ? await quoteShipping(address, subtotal)
    : { cost: 0, free: false, reason: null, quoted: false };

  return {
    items: discountedItems,
    itemsTotal,
    discount,
    subtotal,
    coupon,
    couponId,
    couponError,
    shipping,
    amount_to_pay: round(subtotal + shipping.cost),
  };
};

module.exports = { buildTotals, applyDiscountToItems };
