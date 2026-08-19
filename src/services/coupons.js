// Reglas de un cupón, en un solo lugar.
//
// Lo usan dos caminos que no se pueden contradecir: el endpoint del carrito,
// que le dice al cliente cuánto ahorra, y `createPaymentOrder`, que decide
// cuánto se cobra de verdad. Si la validación viviera en el handler del
// carrito, un cupón vencido entre "agregar" y "pagar" se cobraría con
// descuento.
//
// Es una función pura: no toca la base. Quien la llama trae el cupón y el
// conteo de canjes del cliente.

const round = (amount) => Math.round(amount * 100) / 100;

const MOTIVOS = {
  not_found: "El cupón no existe.",
  inactive: "El cupón no está disponible.",
  not_started: "El cupón todavía no está vigente.",
  expired: "El cupón está vencido.",
  exhausted: "El cupón alcanzó su límite de usos.",
  already_used: "Ya usaste este cupón.",
  min_purchase: "Tu compra no alcanza el mínimo del cupón.",
  empty_cart: "Agregá productos antes de aplicar un cupón.",
};

const rechazo = (reason, message) => ({
  valid: false,
  reason,
  message: message ?? MOTIVOS[reason],
  discount: 0,
});

/**
 * Cuánto descuenta un cupón sobre un subtotal, sin validar nada. El descuento
 * nunca puede superar el subtotal: un cupón fijo de $50.000 sobre un carrito de
 * $30.000 lo deja en cero, no en negativo.
 */
const calculateDiscount = (coupon, subtotal) => {
  if (subtotal <= 0) return 0;

  const bruto =
    coupon.kind === "percentage"
      ? (subtotal * Number(coupon.value)) / 100
      : Number(coupon.value);

  const conTope =
    coupon.max_discount != null
      ? Math.min(bruto, Number(coupon.max_discount))
      : bruto;

  return round(Math.min(conTope, subtotal));
};

/**
 * @param coupon              fila de `coupons`, o null si el código no existe
 * @param subtotal            total de productos, sin envío
 * @param customerRedemptions cuántas veces lo usó ya este cliente
 * @param now                 inyectable para los tests
 */
const evaluateCoupon = (
  coupon,
  { subtotal, customerRedemptions = 0, now = new Date() } = {}
) => {
  if (!coupon) return rechazo("not_found");
  if (!coupon.is_active) return rechazo("inactive");

  if (coupon.starts_at && new Date(coupon.starts_at) > now)
    return rechazo("not_started");

  if (coupon.ends_at && new Date(coupon.ends_at) <= now)
    return rechazo("expired");

  if (
    coupon.max_redemptions != null &&
    coupon.redemptions >= coupon.max_redemptions
  )
    return rechazo("exhausted");

  if (
    coupon.max_per_customer != null &&
    customerRedemptions >= coupon.max_per_customer
  )
    return rechazo("already_used");

  if (subtotal <= 0) return rechazo("empty_cart");

  if (Number(coupon.min_purchase) > subtotal) {
    const minimo = Number(coupon.min_purchase).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    });

    return rechazo(
      "min_purchase",
      `Este cupón aplica a partir de ${minimo} en productos.`
    );
  }

  const discount = calculateDiscount(coupon, subtotal);

  // Un cupón que descuenta $0 (porcentaje ínfimo sobre un carrito chico) no es
  // un cupón aplicado: se rechaza en vez de dejar la UI diciendo "-$0".
  if (discount <= 0) return rechazo("min_purchase", MOTIVOS.min_purchase);

  return { valid: true, reason: null, message: null, discount };
};

/** Forma con la que el cupón viaja al frontend. Nunca se manda la fila entera. */
const toPublic = (coupon, discount) => ({
  code: coupon.code,
  description: coupon.description,
  kind: coupon.kind,
  value: Number(coupon.value),
  discount,
});

module.exports = { evaluateCoupon, calculateDiscount, toPublic };
