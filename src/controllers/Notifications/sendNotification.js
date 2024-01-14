const { Resend } = require("resend");
const path = require("path");
const fs = require("fs");

const _sendNotification = async (email, subject ,template) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const templatePath = path.join(
      __dirname,
      "../../utils/templates",
      template
    );
    const html = fs.readFileSync(templatePath, "utf8");

    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject,
      html: html,
    });

    return response;
  } catch (error) {
    return error;
  }
};

module.exports = _sendNotification;
