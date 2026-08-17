const bcrypt = require("bcrypt");
const { query, withTransaction } = require("../db/client");
const { created, updated } = require("../db/result");

const SALT_ROUNDS = 5;

// Rebuilds the nested shape the API has always returned: flat columns and the
// default address become user_data, and the cart is reached through its foreign
// key instead of a cart_id stored on the customer.
//
// password is deliberately absent. Only findCredentialsByEmail selects it.
const CUSTOMER_SELECT = `
  select
    c.id,
    c.username,
    c.email,
    c.profile_image,
    c.conditions_accepted,
    c.has_order_active,
    c.is_active,
    c.register_date,
    c.last_login,
    cart.id as cart_id,
    json_build_object(
      'name',      c.name,
      'last_name', c.last_name,
      'phone',     c.phone,
      'DNI',       c.dni,
      'address',   case when a.id is null then null else json_build_object(
        'province',       a.province,
        'location',       a.location,
        'address_name',   a.address_name,
        'address_number', a.address_number,
        'department',     a.department,
        'zip_code',       a.zip_code
      ) end
    ) as user_data
  from customers c
  left join addresses a    on a.customer_id = c.id and a.is_default
  left join carts     cart on cart.customer_id = c.id
`;

const findById = async (id) => {
  const { rows } = await query(`${CUSTOMER_SELECT} where c.id = $1`, [id]);

  return rows[0] ?? null;
};

const findByEmail = async (email) => {
  const { rows } = await query(`${CUSTOMER_SELECT} where c.email = $1`, [email]);

  return rows[0] ?? null;
};

const findByName = async (name) => {
  const { rows } = await query(`${CUSTOMER_SELECT} where c.name ilike $1`, [
    `%${name}%`,
  ]);

  return rows;
};

// The only query that returns the password hash. Used by login and nowhere else.
const findCredentialsByEmail = async (email) => {
  const { rows } = await query(
    `select c.id, c.email, c.password, c.is_active, cart.id as cart_id
       from customers c
       left join carts cart on cart.customer_id = c.id
      where c.email = $1`,
    [email]
  );

  return rows[0] ?? null;
};

const create = async (data) => {
  const password = await bcrypt.hash(data.password, SALT_ROUNDS);

  return withTransaction(async (client) => {
    const result = await client.query(
      `insert into customers
         (username, email, password, name, last_name, phone, dni, conditions_accepted)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        data.username,
        data.email,
        password,
        data.name,
        data.last_name,
        data.phone,
        data.DNI,
        data.conditions_accepted,
      ]
    );

    const { address } = data;

    await client.query(
      `insert into addresses
         (customer_id, province, location, address_name, address_number, department, zip_code)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        result.rows[0].id,
        address.province,
        address.location,
        address.address_name,
        address.address_number,
        address.department,
        address.zip_code,
      ]
    );

    return created(result);
  });
};

// Mirrors the old behaviour: an address in the payload updates only the
// address, otherwise the profile fields are updated.
const PROFILE_COLUMNS = {
  name: "name",
  last_name: "last_name",
  phone: "phone",
  DNI: "dni",
};

const updateProfile = async (id, data) => {
  if (data.address) {
    const result = await query(
      `update addresses
          set province = $2, location = $3, address_name = $4,
              address_number = $5, department = $6, zip_code = $7
        where customer_id = $1 and is_default
      returning id`,
      [
        id,
        data.address.province,
        data.address.location,
        data.address.address_name,
        data.address.address_number,
        data.address.department,
        data.address.zip_code,
      ]
    );

    return updated(result);
  }

  const entries = Object.entries(data).filter(([key]) => PROFILE_COLUMNS[key]);

  if (entries.length === 0) return updated({ rowCount: 0, rows: [] });

  const assignments = entries
    .map(([key], index) => `${PROFILE_COLUMNS[key]} = $${index + 2}`)
    .join(", ");

  const result = await query(
    `update customers set ${assignments} where id = $1 returning id`,
    [id, ...entries.map(([, value]) => value)]
  );

  return updated(result);
};

const updatePassword = async (id, password) => {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `update customers set password = $2 where id = $1 returning id`,
    [id, hash]
  );

  return updated(result);
};

const updateProfileImage = async (id, url) => {
  const result = await query(
    `update customers set profile_image = $2 where id = $1 returning id`,
    [id, url]
  );

  return updated(result);
};

const updateLastLogin = async (id) => {
  const result = await query(
    `update customers set last_login = now() where id = $1 returning id`,
    [id]
  );

  return updated(result);
};

const activate = async (id) => {
  const result = await query(
    `update customers set is_active = true where id = $1 returning id`,
    [id]
  );

  return updated(result);
};

const markOrderActive = async (id) => {
  const result = await query(
    `update customers set has_order_active = true where id = $1 returning id`,
    [id]
  );

  return updated(result);
};

// Favorites live on a join table, so adding one no longer rewrites the product.
const addFavorite = async (product_id, customer_id) => {
  const result = await query(
    `insert into product_favorites (product_id, customer_id)
     values ($1, $2)
     on conflict do nothing
     returning product_id as id`,
    [product_id, customer_id]
  );

  return created(result);
};

const removeFavorite = async (product_id, customer_id) => {
  const result = await query(
    `delete from product_favorites
      where product_id = $1 and customer_id = $2
     returning product_id as id`,
    [product_id, customer_id]
  );

  return updated(result);
};

// Replaces loading every product and filtering in JS. Reuses the product field
// list so favorites carry the same effective pricing as any other listing.
const findFavorites = async (customer_id) => {
  const { PRODUCT_FIELDS } = require("./product.repository");

  const { rows } = await query(
    `select ${PRODUCT_FIELDS}
       from product_favorites f
       join products p on p.id = f.product_id
      where f.customer_id = $1 and p.is_active
      order by f.created_at desc`,
    [customer_id]
  );

  return rows;
};

module.exports = {
  findById,
  findByEmail,
  findByName,
  findCredentialsByEmail,
  create,
  updateProfile,
  updatePassword,
  updateProfileImage,
  updateLastLogin,
  activate,
  markOrderActive,
  addFavorite,
  removeFavorite,
  findFavorites,
};
