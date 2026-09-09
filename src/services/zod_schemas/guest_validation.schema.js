const z = require("zod");

// Lo mínimo para poder cobrar y despachar. Es a propósito más corto que
// customer_validation: el registro pide usuario, contraseña y DNI, y esto se
// completa con el carrito ya armado, que es el peor momento para pedir de más.
//
// Lo que NO está acá y sí está en el registro: username y password (los genera
// el servidor), confirm_password y DNI (opcional, abajo).
const guestValidationSchema = z.object({
  email: z
    .string({ required_error: "El correo es obligatorio" })
    .email("El correo no parece válido"),
  name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre es obligatorio")
    .max(60),
  last_name: z
    .string({ required_error: "El apellido es obligatorio" })
    .trim()
    .min(2, "El apellido es obligatorio")
    .max(60),
  phone: z
    .string({ required_error: "El teléfono es obligatorio" })
    .trim()
    .min(6, "El teléfono es obligatorio")
    .max(20),
  address: z.object({
    province: z.string({ required_error: "La provincia es obligatoria" }).trim().min(1, "La provincia es obligatoria"),
    location: z.string({ required_error: "La localidad es obligatoria" }).trim().min(1, "La localidad es obligatoria"),
    address_name: z.string({ required_error: "La calle es obligatoria" }).trim().min(1, "La calle es obligatoria"),
    address_number: z.string({ required_error: "La altura es obligatoria" }).trim().min(1, "La altura es obligatoria"),
    // Sin depto no se puede comprar hoy porque el zod del registro lo exige como
    // string. Una casa no tiene depto: acá es opcional y viaja como "".
    department: z.string().trim().max(20).optional().default(""),
    zip_code: z.string({ required_error: "El código postal es obligatorio" }).trim().min(3, "El código postal es obligatorio"),
  }),
  // El DNI solo hace falta para facturar. Si no viene, la compra igual entra.
  DNI: z.string().trim().max(12).optional(),
  conditions_accepted: z.literal(true, {
    errorMap: () => ({ message: "Hay que aceptar los términos para comprar" }),
  }),
});

const validateGuest = (input) => guestValidationSchema.safeParse(input);

module.exports = { validateGuest };
