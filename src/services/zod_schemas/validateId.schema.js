const z = require("zod");

const idSchema = z
  .string({
    required_error: "ID is required",
    invalid_type_error: "ID must be a string",
  })
  .min(24, { message: "ID must be at least 24 characters" })
  .max(24, { message: "ID must be at most 24 characters" });

const validateId = (input) => {
  return idSchema.safeParse(input);
};

module.exports = validateId;
