const customerRepository = require("../../repositories/customer.repository");
const micorreo = require("../../services/micorreo");

/**
 * Sucursales de Correo Argentino de la provincia de la dirección, las cercanas
 * al CP primero.
 *
 * Una provincia trae cientos (Córdoba, 385). MiCorreo no da distancia, pero
 * cada sucursal informa los CPs que atiende (`nearByPostalCode`): esas van
 * arriba, después las de la misma localidad, y el resto por nombre.
 */
const agenciesForAddress = async (address) => {
  const code = micorreo.provinceCode(address?.province);
  if (!code) throw new Error(`No se reconoce la provincia "${address?.province}"`);

  const cp = micorreo.toCp4(address.zip_code);
  const locality = String(address.location ?? "").trim().toUpperCase();

  const rank = (a) =>
    a.near_postal_codes.includes(cp)
      ? 0
      : locality && [a.locality, a.city].includes(locality)
      ? 1
      : 2;

  return (await micorreo.agencies(code))
    .map((a) => ({ ...a, near: rank(a) === 0 }))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

const getAgencies = async (req, res) => {
  try {
    const { customer_id } = req.body;

    const customer = await customerRepository.findById(customer_id);
    const agencies = await agenciesForAddress(customer?.user_data?.address);

    return res.status(200).json({
      success: true,
      data: agencies.map(({ near_postal_codes, ...a }) => a),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = getAgencies;
module.exports.agenciesForAddress = agenciesForAddress;
