const { Resend } = require("resend");

const _sendEmailVerification = async (email, name ,url) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: email,
      subject: "VIGI | Verifica tu correo electronico",
      html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verificación de Correo Electrónico</title>
        </head>
        <body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2>Verificación de Correo Electrónico</h2>
                <p>Estimado/a ${name},</p>
                <p>Gracias por registrarte en nuestro servicio. Por favor, haz clic en el siguiente enlace para verificar tu dirección de correo electrónico:</p>
                <p><a href="${url}" style="background-color: #1E053F; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px;">Verificar Correo Electrónico</a></p>
                <p>Si no has solicitado esto, puedes ignorar este mensaje.</p>
                <p>¡Gracias!<br>El equipo de VIGI 💜</p>
            </div>
        </body>
        </html>
      `,
    });

    return response;
  } catch (error) {
    return error;
  }
};

module.exports = _sendEmailVerification;
