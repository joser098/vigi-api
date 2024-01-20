const z = require("zod");

const productSchema = z.object({
  id: z
    .string({
      required_error: "Product ID is required",
      invalid_type_error: "Product ID must be a string",
    })
    .min(24, { message: "Product ID must be at least 24 characters" }),
  title: z.string({
    required_error: "Product title is required",
    invalid_type_error: "Product title must be a string",
  }),
  quantity: z
    .number({
      required_error: "Quantity is required",
      invalid_type_error: "Quantity must be a number",
    })
    .min(1, { message: "Quantity must be at least 1" })
    .positive(),
  unit_price: z.number({ required_error: "Unit price is required" }).positive(),
});

const cartSchema = z.object({
  cart_id: z
    .string({
      required_error: "Cart ID is required",
      invalid_type_error: "Cart ID must be a string",
    })
    .min(24, { message: "Cart ID must be at least 24 characters" }),
  products: z.array(productSchema),
  products_total: z.number().int().positive(),
  amount_to_pay: z.number().positive(),
});

const validateCartAddProduct = (input) => {
  return cartSchema.safeParse(input);
};

module.exports = validateCartAddProduct;
