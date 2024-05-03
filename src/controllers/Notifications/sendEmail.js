const { Resend } = require("resend");

const _sendEmail = async (email, subject, template) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: subject,
      html: template,
    });

    return response;
  } catch (error) {
    return error;
  }
};

module.exports = _sendEmail;
