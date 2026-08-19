// Reglas de cupón y reparto del descuento. No toca la base: es la aritmética
// que decide cuánto se cobra, y es lo que no puede fallar.
const { evaluateCoupon, calculateDiscount } = require("../../services/coupons");
const { applyDiscountToItems } = require("../../services/checkout");

const cupon = (extra = {}) => ({
  id: "c1",
  code: "TEST",
  kind: "percentage",
  value: 10,
  max_discount: null,
  min_purchase: 0,
  max_redemptions: null,
  max_per_customer: null,
  redemptions: 0,
  starts_at: null,
  ends_at: null,
  is_active: true,
  ...extra,
});

describe("evaluateCoupon", () => {
  it("aplica un porcentaje sobre el subtotal", () => {
    const r = evaluateCoupon(cupon(), { subtotal: 200000 });
    expect(r).toMatchObject({ valid: true, discount: 20000 });
  });

  it("aplica un monto fijo", () => {
    const r = evaluateCoupon(cupon({ kind: "fixed", value: 15000 }), {
      subtotal: 200000,
    });
    expect(r).toMatchObject({ valid: true, discount: 15000 });
  });

  it("nunca descuenta más que el subtotal", () => {
    const r = evaluateCoupon(cupon({ kind: "fixed", value: 500000 }), {
      subtotal: 30000,
    });
    expect(r.discount).toBe(30000);
  });

  it("respeta el tope en pesos de un porcentaje", () => {
    const r = evaluateCoupon(cupon({ value: 20, max_discount: 50000 }), {
      subtotal: 2000000,
    });
    expect(r.discount).toBe(50000);
  });

  it("rechaza un cupón inactivo", () => {
    const r = evaluateCoupon(cupon({ is_active: false }), { subtotal: 100000 });
    expect(r).toMatchObject({ valid: false, reason: "inactive" });
  });

  it("rechaza un cupón vencido", () => {
    const r = evaluateCoupon(cupon({ ends_at: "2020-01-01T00:00:00Z" }), {
      subtotal: 100000,
    });
    expect(r).toMatchObject({ valid: false, reason: "expired" });
  });

  it("rechaza un cupón que todavía no arrancó", () => {
    const r = evaluateCoupon(cupon({ starts_at: "2999-01-01T00:00:00Z" }), {
      subtotal: 100000,
    });
    expect(r).toMatchObject({ valid: false, reason: "not_started" });
  });

  it("rechaza cuando se agotaron los usos", () => {
    const r = evaluateCoupon(cupon({ max_redemptions: 5, redemptions: 5 }), {
      subtotal: 100000,
    });
    expect(r).toMatchObject({ valid: false, reason: "exhausted" });
  });

  it("rechaza cuando el cliente ya lo usó todas las veces permitidas", () => {
    const r = evaluateCoupon(cupon({ max_per_customer: 1 }), {
      subtotal: 100000,
      customerRedemptions: 1,
    });
    expect(r).toMatchObject({ valid: false, reason: "already_used" });
  });

  it("rechaza cuando no llega a la compra mínima", () => {
    const r = evaluateCoupon(cupon({ min_purchase: 150000 }), {
      subtotal: 100000,
    });
    expect(r).toMatchObject({ valid: false, reason: "min_purchase" });
  });

  it("rechaza un código inexistente", () => {
    expect(evaluateCoupon(null, { subtotal: 100000 })).toMatchObject({
      valid: false,
      reason: "not_found",
    });
  });

  it("no descuenta sobre un carrito vacío", () => {
    expect(evaluateCoupon(cupon(), { subtotal: 0 })).toMatchObject({
      valid: false,
      reason: "empty_cart",
    });
  });
});

describe("calculateDiscount", () => {
  it("redondea a dos decimales", () => {
    expect(calculateDiscount(cupon({ value: 33 }), 100)).toBe(33);
    expect(calculateDiscount(cupon({ value: 15 }), 33333)).toBe(4999.95);
  });
});

describe("applyDiscountToItems", () => {
  const items = [
    { id: "a", unit_price: 100000, quantity: 2 },
    { id: "b", unit_price: 50000, quantity: 1 },
  ];

  it("reparte el descuento proporcional a cada ítem", () => {
    const [a, b] = applyDiscountToItems(items, 25000);
    expect(a.unit_price).toBe(90000);
    expect(b.unit_price).toBe(45000);
  });

  it("deja el total en subtotal menos descuento", () => {
    const total = applyDiscountToItems(items, 25000).reduce(
      (t, i) => t + i.unit_price * i.quantity,
      0
    );
    expect(total).toBe(225000);
  });

  it("devuelve los ítems intactos sin descuento", () => {
    expect(applyDiscountToItems(items, 0)).toBe(items);
  });

  it("no deja precios negativos aunque el descuento se pase", () => {
    const salida = applyDiscountToItems(items, 999999);
    expect(salida.every((i) => i.unit_price >= 0)).toBe(true);
  });
});
