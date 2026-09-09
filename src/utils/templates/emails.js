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
        <td style="text-align: center;">${product.name || product.title}</td>
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
            <p>contacto@vigi.com.ar</p>
        </div>
    </body>
    </html>
    `
};

const failVisit = () => {
    return `
    <!DOCTYPE html PUBLIC \"-//W3C//DTD XHTML 1.0 Transitional//EN\" \"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd\">
    <html dir=\"ltr\" lang=\"en\">
    <head><meta content=\"width=device-width\" name=\"viewport\"/><link rel=\"preload\" as=\"image\" href=\"https://d1256qxyebmnhq.cloudfront.net/assets/logo_np.png\"/>
     <meta content=\"text/html; charset=UTF-8\" http-equiv=\"Content-Type\"/><meta name=\"x-apple-disable-message-reformatting\"/>
     <meta content=\"IE=edge\" http-equiv=\"X-UA-Compatible\"/>
     <meta name=\"x-apple-disable-message-reformatting\"/>
     <meta content=\"telephone=no,address=no,email=no,date=no,url=no\" name=\"format-detection\"/>
     <meta content=\"light\" name=\"color-scheme\"/>
     <meta content=\"light\" name=\"supported-color-schemes\"/><!--$--><style>@font-face {font-family: 'Inter';font-style: normal;font-weight: 400;mso-font-alt: 'sans-serif';src: url(https://rsms.me/inter/font-files/Inter-Regular.woff2?v=3.19) format('woff2');}* {font-family: 'Inter', sans-serif;}</style><style>blockquote,h1,h2,h3,img,li,ol,p,ul{margin-top:0;margin-bottom:0}@media only screen and (max-width:425px){.tab-row-full{width:100%!important}.tab-col-full{display:block!important;width:100%!important}.tab-pad{padding:0!important}}</style>
     </head>
     <body style=\"margin:0\"><table align=\"center\" width=\"100%\" border=\"0\" cellPadding=\"0\" cellSpacing=\"0\" role=\"presentation\" style=\"max-width:600px;min-width:300px;width:100%;margin-left:auto;margin-right:auto;padding:0.5rem\">
     <tbody>
     <tr style=\"width:100%\">
     <td>
     <table align=\"center\" width=\"100%\" border=\"0\" cellPadding=\"0\" cellSpacing=\"0\" role=\"presentation\" style=\"margin-top:0px;margin-bottom:32px\">
     <tbody style=\"width:100%\">
     <tr style=\"width:100%\">
     <td align=\"center\" data-id=\"__react-email-column\">
     <img title=\"Image\" alt=\"Image\" src=\"https://d1256qxyebmnhq.cloudfront.net/assets/logo_np.png\" style=\"display:block;outline:none;border:none;text-decoration:none;width:172px;max-width:100%\"/></td></tr></tbody>
     </table><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Estimado/a Esteban Ignacio Curcio</p><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Le informamos que el día de hoy 17/12/2024, realizamos una visita a la dirección indicada para entregar su paquete. Sin embargo, no encontramos a nadie en el domicilio para recibirlo.</p><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Detalles de la entrega:</p><table align=\"center\" width=\"100%\" border=\"0\" cellPadding=\"0\" cellSpacing=\"0\" role=\"presentation\" style=\"max-width:100%\"><tbody><tr style=\"width:100%\"><td><ul style=\"margin-top:0px;margin-bottom:20px;padding-left:26px;list-style-type:disc\"><li style=\"margin-bottom:8px;padding-left:6px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\"><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:0px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Número de seguimiento: <span style=\"color:rgb(255, 111, 68)\">6761d4b2772c6b7ae5a18f85</span></p></li>
     <li style=\"margin-bottom:8px;padding-left:6px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\"><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:0px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Dirección: <strong>Bulnes 849, Ramos Mejia 1704</strong></p></li><li style=\"margin-bottom:8px;padding-left:6px;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\"><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:0px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Hora aproximada de la visita: <strong>15:10</strong></p></li></ul></td></tr></tbody></table><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Por favor, póngase en contacto con nosotros a través de <strong>Whatsapp</strong> <strong>11 26039243</strong> para coordinar una nueva entrega o la recolección en nuestra sucursal más cercana.</p><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Quedamos atentos a su respuesta.</p><p style=\"font-size:15px;line-height:24px;margin:16px 0;text-align:left;margin-bottom:20px;margin-top:0px;color:#374151;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale\">Atentamente,<br/>Jose Jaramillo<br/>Ventas<br/><strong>Vigi</strong></p></td></tr></tbody></table><!--/$-->
     </body></html>`
}



module.exports = {
    emailVerificationHtml,
    resetPasswordHtml,
    successPayHtml,
    failVisit
};