const db_conn = require("../../services/db_conn");

const _search = async (keyword) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  const keyworReg = new RegExp(keyword, "i");

  const result = await collection
    .find(
      {
        $or: [
          { model: { $in: [keyworReg] } },
          { tags: { $in: [keyworReg] } },
          { description: { $in: [keyworReg] } },
          { provider: { $in: [keyworReg] } },
          { category: { $in: [keyworReg] } },
        ],
      },
      {
        projection: {
          thumbnail: 1,
          model: 1,
          price: 1,
          provider: 1,
          has_promotion: 1,
          category: 1,
          details: 1,
          dvr_details: 1,
          
        },
        sort: {
          price: 1,
          has_promotion: 1
        }
      }
    )
    .toArray();

    return result;
};

module.exports = _search;
