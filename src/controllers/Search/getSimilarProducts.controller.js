const db_conn = require("../../services/db_conn");

const _getSimilarProducts = async (category, provider) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const result = await collection
    .find(
      {
        category: category,
        provider: provider,
      },
      {
        projection: {
          thumbnail: 1,
          model: 1,
          has_promotion: 1,
          price: 1,
          details: 1,
          category: 1,
          dvr_details: 1,
          discount: 1,
        },
      }
    )
    .toArray();

  return result;
};

module.exports = _getSimilarProducts;
