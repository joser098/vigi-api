const z = require("zod");

const customerValidationSchema = z.object({
  username: z
    .string({
      required_error: "Username is required",
      invalid_type_error: "Username must be a string",
    })
    .min(3)
    .max(15),
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a string",
    })
    .email(),
  password: z.string({
    required_error: "Password is required",
    invalid_type_error: "Password must be a string",
  }),
  name: z
    .string({
      required_error: "Name is required",
      invalid_type_error: "Name must be a string",
    })
    .min(3)
    .max(15),
  last_name: z
    .string({
      required_error: "Last name is required",
      invalid_type_error: "Last name must be a string",
    })
    .min(3)
    .max(20),
  address: z
    .string({
      required_error: "Address is required",
      invalid_type_error: "Address must be a string",
    })
    .min(3),
  phone: z
    .string({
      required_error: "Phone is required",
      invalid_type_error: "Phone must be a string",
    })
    .min(3)
    .max(15),
  DNI: z
    .string({
      required_error: "Dni is required",
      invalid_type_error: "Dni must be a string",
    })
    .min(3)
    .max(12),
});

const validateCustomer = (input) => {
  return customerValidationSchema.safeParse(input);
};

const validateUpdateCustomer = (input) => {
  return customerValidationSchema.partial().safeParse(input);
};

module.exports = {
  validateCustomer,
  validateUpdateCustomer,
};
