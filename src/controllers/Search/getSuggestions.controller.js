const db_conn = require("../../services/db_conn");

const _getSuggestions = async (keyword) => {
  const collection = await db_conn(process.env.DB_NAME, process.env.DB_PRODUCT);

  // const keywordArr = keyword.split(" ");
  const keyworReg = new RegExp(keyword, "i")

  // const regexQueries = keywordArr.map((word) => new RegExp(word, "i"));

  const result = await collection
    .find(
      {
        $or: [
          { model: { $in: [keyworReg] } },
          { tags: { $in: [keyworReg] } },
          { title: { $in: [keyworReg] } },
        ],
      },
      {
        projection: {
          thumbnail: 1,
          model: 1,
          price: 1,
          provider: 1,
          has_promotion: 1,
          discount: 1
        },
        sort: { price: 1 },
      }
    )
    .toArray();

  return result;
};

module.exports = _getSuggestions;
