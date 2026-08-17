const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres raises a syntax error on a malformed uuid, which surfaces as an
// opaque driver message. Repositories check first and fail on their own terms.
const isUuid = (value) => UUID_PATTERN.test(value ?? "");

module.exports = { isUuid };
