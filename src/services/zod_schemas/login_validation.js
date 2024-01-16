const z = require("zod");

const loginValidation = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a string",
    })
    .email(),
  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a string",
    })
    .min(5)
    .max(50),
});

const validateLogin = (input) => {
  return loginValidation.safeParse(input);
};

module.exports = {
  validateLogin,
};
