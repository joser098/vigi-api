const emailVerificationHtml = (name, url) => {
  return `
    <!DOCTYPE html>
      <html lang="es">
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
    `;
};

const resetPasswordHtml = (name, url) => {
  return `
    <!DOCTYPE html>
    <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Instrucciones para restablecer tu contraseña</title>
        </head>
        <body>
            <p>¡Hola ${name}!</p>
            <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en VIGI. No te preocupes, estamos aquí para ayudarte a recuperar el acceso.</p>
            <p>Por favor, sigue estos pasos para restablecer tu contraseña:</p>

            <ol>
                <li>Haz clic en el siguiente enlace para acceder a la página de restablecimiento de contraseña:
                    <p><a href="${url}" style="background-color: #1E053F; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px;">Restablecer contraseña</a></p>
                </li>

                <li>Una vez en la página de restablecimiento de contraseña, sigue las instrucciones para crear una nueva contraseña segura para tu cuenta.</li>
            </ol>
            <p>¡Y eso es todo! Una vez que hayas completado estos pasos, podrás acceder a tu cuenta con tu nueva contraseña.</p>
            <p>Si no has solicitado restablecer tu contraseña, por favor ignora este correo electrónico o ponte en contacto con nuestro equipo de soporte para que podamos ayudarte.</p>
            <p>Gracias,<br>El equipo de VIGI 💜</p>
        </body>
    </html>
    `;
};

module.exports = {
    emailVerificationHtml,
    resetPasswordHtml
}