const db_conn = require("../../services/db_conn");

const _getCarruselImages = async () => {
    const collection = await db_conn(process.env.DB_NAME, "carrusel_images");

    const result = await collection.find().toArray();

    return result;
};

module.exports = _getCarruselImages;