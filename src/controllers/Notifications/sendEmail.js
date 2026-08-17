const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (toEmail, fromEmail, subject, template) => {
  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail ?? process.env.RESEND_FROM_EMAIL,
      to: toEmail,
      subject: subject,
      html: template,
    });

    // Resend returns the error in the response instead of throwing.
    if (error) {
      console.log(error);
      return error;
    }

    return data;
  } catch (caught) {
    console.log(caught);
    return caught;
  }
};

module.exports = sendEmail;
