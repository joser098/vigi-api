const jwt = require("jsonwebtoken");
const customerRepository = require("../../repositories/customer.repository");
const cartRepository = require("../../repositories/cart.repository");
const { validateGuest } = require("../../services/zod_schemas/guest_validation.schema");

// Compra sin cuenta.
//
// El invitado deja nombre, correo, teléfono y dirección, y esto le devuelve el
// mismo token que devuelve el login. De ahí en adelante el carrito, la
// cotización de envío, el pago y la orden son exactamente los de siempre: no
// hay una segunda rama del checkout que pueda quedar desincronizada con la
// primera. La diferencia vive entera acá.
const guestCheckout = async (req, res) => {
  try {
    const validation = validateGuest(req.body);

    if (!validation.success) {
      return res
        .status(400)
        .json({ success: false, message: validation.error.issues[0].message });
    }

    const data = validation.data;

    // El correo es único en la tabla, así que no se puede crear otro cliente
    // con el mismo. Y reusar el que existe sin pedir contraseña sería regalar
    // un token —con la dirección y las compras adentro— a cualquiera que
    // escriba el correo de otro. Se corta acá y se lo manda a entrar.
    const existing = await customerRepository.findByEmail(data.email);

    if (existing) {
      return res.status(409).json({
        success: false,
        code: "email_registrado",
        message:
          "Ya hay una cuenta con ese correo. Iniciá sesión para terminar la compra.",
      });
    }

    const customer = await customerRepository.createGuest(data);

    if (!customer.inserted || !customer.id) {
      return res
        .status(500)
        .json({ success: false, message: "No se pudo registrar la compra" });
    }

    const cart = await cartRepository.create(customer.id);

    if (!cart.inserted || !cart.id) {
      return res
        .status(500)
        .json({ success: false, message: "No se pudo crear el carrito" });
    }

    // Las mismas claims que firma el login: userAuth saca de acá el customer_id
    // y el cart_id, y no sabe ni le importa si el cliente es un invitado.
    const token = jwt.sign(
      { id: customer.id, cart_id: cart.id, email: data.email },
      process.env.JWT_SECRET
    );

    return res.status(201).json({ success: true, data: { access: true, token } });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = guestCheckout;
