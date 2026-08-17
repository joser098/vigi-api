const z = require('zod');

// Must match the codes seeded into order_statuses.
const orderStatusSchema = z.enum([
   "recibido",
   "en_preparacion",
   "enviado",
   "entregado",
]);

// Canonical form: lowercase, unaccented. The nav in vigi-app links to
// /category/bateria, /category/Kits and /category/analogas, so the input is
// normalised before validating rather than enumerating every spelling — nobody
// types accents into a URL.
const categoryProductSchema = z.enum([
   "camaras",
   "alarmas",
   "almacenamiento",
   "kits",
   "porteros",
   // Browse facets: not categories, they resolve against their own columns.
   "interior",
   "exterior",
   "bateria",
   "analogas",
]);

const normalizeCategory = (value) =>
   String(value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLowerCase();

const validateOrderStatus = (status) => {
   return orderStatusSchema.safeParse(status);
};

// `data` comes back canonical, so repositories only ever see the normalised form.
const validateCategoryProduct = (category) => {
   return categoryProductSchema.safeParse(normalizeCategory(category));
};

module.exports = {
   validateOrderStatus,
   validateCategoryProduct,
   normalizeCategory,
};
