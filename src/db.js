const { MongoClient, ServerApiVersion } = require("mongodb");
const URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}.0yhxkwz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function conn(db_name) {
  try {
    await client.connect();

    const db = client.db(db_name);

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    return db;
  } catch (error) {
    const err = `Error conexion with MongoDB ${error}`;
    console.log(err);
    throw Error(err);
  }
};

module.exports = conn;
