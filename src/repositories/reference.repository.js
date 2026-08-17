const { query } = require("../db/client");

// Provinces used to read process.env.DB_PROVINCES, which was never defined, so
// the endpoint queried an undefined collection and always failed.
const findProvinces = async () => {
  const { rows } = await query(
    `select id, name from provinces where is_active order by name`
  );

  return rows;
};

const findCarruselImages = async () => {
  const { rows } = await query(
    `select id, image_url, link_url, position
       from carrusel_images
      where is_active
      order by position`
  );

  return rows;
};

module.exports = { findProvinces, findCarruselImages };
