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
            <header style="display: flex; justify-content: center; align-items: center; background-color: #FFFFFF; width: 100%;">
                <img src="https://d1256qxyebmnhq.cloudfront.net/assets/logo_np.png" alt="Vigi-logo" style="width: 100px; height: auto; margin: auto" />
            </header>
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
            <header style="display: flex; justify-content: center; align-items: center; background-color: #FFFFFF; width: 100%;">
                <img src="https://d1256qxyebmnhq.cloudfront.net/assets/logo_np.png" alt="Vigi-logo" style="width: 100px; height: auto; margin: auto" />
            </header>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Restablecer Contraseña</h2>
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
            </div>
        </body>
    </html>
    `;
};

const successPayHtml = (name, products, total_payed, date, payment_method, nroOrder) => {
    const productRows = products.map(product => `
    <tr style="border: 1px;">
        <td style="text-align: center;">${product.quantity}</td>
        <td style="text-align: center;">${product.name}</td>
        <td style="text-align: center;">$${product.unit_price}</td>
    </tr>
    `).join(''); style="text-align: center;";

    const fecha = date.split("T")[0].split("-").reverse().join("/");
    const metodo_pago = payment_method.includes("debit") ? "Tarjeta de débito" : payment_method.includes("credit") ? "Tarjeta de crédito" : "Dinero en cuenta";

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirmación de pago y aprobación de compra</title>
    </head>
    <body>
        <header style="display: flex; justify-content: center; align-items: center; background-color: #FFFFFF; width: 100%;">
            <img src="https://d1256qxyebmnhq.cloudfront.net/assets/logo_np.png" alt="Vigi-logo" style="width: 100px; height: auto; margin: auto;" />
        </header>
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>Confirmación de pago y aprobación de compra</h2>
            <p>Estimado <span style="font-weight: bold;">${name}</span>,</p>
            <p>Es un placer informarte que hemos recibido con éxito el pago correspondiente a tu compra realizada el ${fecha}. Queremos confirmarte que el pago ha sido procesado correctamente y tu pedido ha sido aprobado.</p>
            <span>Número de orden:</span>
            <span style="font-weight: bold; font-size: large;">${nroOrder}</span>
            <h3>Detalles de la compra:</h3>
            <ul>
                <li style="margin: 10px auto;">Producto(s):
                    <table>
                    <tr style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 10px; background-color: #1E053F; color: white">
                        <th style="padding: 10px 15px; text-align: center;">Cantidad</th>
                        <th style="padding: 10px 15px; text-align: center;">Producto</th>
                        <th style="padding: 10px 15px; text-align: center;">Precio</th>
                    </tr>
                    ${productRows}
                    </table>
                </li>
                <li>Total pagado: <span style="font-weight: bold;">$${total_payed}</span></li>
                <li>Fecha de la compra: <span style="font-weight: bold;"> ${fecha}</span></li>
                <li>Método de pago: <span style="font-weight: bold;"> ${metodo_pago}</span></li>
            </ul>
            <p>Tu satisfacción es nuestra prioridad, por lo que nos esforzamos por brindarte la mejor experiencia de compra posible. Nuestro equipo está trabajando diligentemente para preparar tu pedido y asegurarse de que sea entregado en el menor tiempo posible.</p>
            <p>Si tienes alguna pregunta o inquietud sobre tu compra, no dudes en ponerte en contacto con nuestro equipo de atención al cliente. Estamos aquí para ayudarte en todo lo que necesites.</p>
            <p>Agradecemos sinceramente tu preferencia y esperamos que disfrutes de tus productos tanto como nosotros disfrutamos de servirte.</p>
            <p>¡Gracias por elegirnos!<br>El equipo de VIGI 💜</p>
            <p>contacto@vigi.cam</p>
        </div>
    </body>
    </html>
    `
};



module.exports = {
    emailVerificationHtml,
    resetPasswordHtml,
    successPayHtml
};