const { query } = require("../db/client");

/**
 * Baja de la lista de marketing por token.
 *
 * La fila no se borra: se marca. Un contacto borrado volvería a entrar en la
 * próxima importación desde clientes y recibiría justo lo que pidió no
 * recibir.
 *
 * Es idempotente. Si el token ya se usó devuelve el contacto igual, porque
 * para el que hizo clic dos veces el resultado es el mismo: está dado de baja.
 */
const unsubscribeByToken = async (token) => {
  const { rows } = await query(
    `update marketing_contacts
        set is_subscribed   = false,
            unsubscribed_at = coalesce(unsubscribed_at, now())
      where unsubscribe_token = $1
    returning email`,
    [token]
  );

  return rows[0] ?? null;
};

module.exports = { unsubscribeByToken };
