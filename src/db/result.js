// Normalises write results so handlers never read driver-specific fields.
// Every repository write returns this shape:
//
//   { matched, modified, inserted, id }
//
// Add `returning id` to a statement for `id` to be populated.

const created = ({ rowCount = 0, rows = [] } = {}) => ({
  matched: 0,
  modified: 0,
  inserted: rowCount,
  id: rows[0]?.id ?? null,
});

const updated = ({ rowCount = 0, rows = [] } = {}) => ({
  matched: rowCount,
  modified: rowCount,
  inserted: 0,
  id: rows[0]?.id ?? null,
});

module.exports = { created, updated };
