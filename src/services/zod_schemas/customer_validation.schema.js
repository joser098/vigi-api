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
  phone: z
    .string({
      required_error: "Phone is required",
      invalid_type_error: "Phone must be a string",
    })
    .min(3)
    .max(15),
  address: z.object({
    province: z.string({
      required_error: "Province is required",
      invalid_type_error: "Province must be a string",
    }),
    location: z.string({
      required_error: "Location is required",
      invalid_type_error: "Location must be a string",
    }),
    address_name: z.string({
      required_error: "Address name is required",
      invalid_type_error: "Address name must be a string",
    }),
    address_number: z.string({
      required_error: "Address number is required",
      invalid_type_error: "Address number must be a string",
    }),
    department: z.string({
      required_error: "Deparment is required",
      invalid_type_error: "Deparment must be a string",
    }),
    zip_code: z.string({
      required_error: "Zip code is required",
      invalid_type_error: "Zip code must be a string",
    }),
  }),
  conditions_accepted: z.boolean({
    required_error: "Conditions accept is required",
    invalid_type_error: "Conditions accept must be a boolean",
  })
  // DNI: z
  //   .string({
  //     required_error: "Dni is required",
  //     invalid_type_error: "Dni must be a string",
  //   })
  //   .min(3)
  //   .max(12),
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
