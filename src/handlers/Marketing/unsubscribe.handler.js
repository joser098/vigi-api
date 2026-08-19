const marketingRepository = require("../../repositories/marketing.repository");
const { isUuid } = require("../../db/uuid");

/**
 * Baja de la lista de marketing. Público: quien se da de baja no tiene sesión.
 *
 * Es POST y no GET a propósito. El link del mail lleva a una página con un
 * botón, y recién ese botón pega acá. Con un GET, cualquier antivirus o
 * prefetcher de un cliente de correo que sigue los links daría de baja a gente
 * que nunca hizo clic.
 */
const unsubscribe = async (req, res) => {
  try {
    const { token } = req.body;

    if (!isUuid(token)) {
      return res.status(400).json({ success: false, message: "Link inválido" });
    }

    const contacto = await marketingRepository.unsubscribeByToken(token);

    if (!contacto) {
      return res
        .status(404)
        .json({ success: false, message: "No encontramos esa suscripción" });
    }

    return res.status(200).json({ success: true, data: { email: contacto.email } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = unsubscribe;
