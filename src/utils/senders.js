const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN;

// Sender addresses per purpose. Switching domains is an env change only.
const senders = {
  noreply: `noreply@${EMAIL_DOMAIN}`,
  verification: `verification@${EMAIL_DOMAIN}`,
  contact: `contacto@${EMAIL_DOMAIN}`,
};

module.exports = senders;
