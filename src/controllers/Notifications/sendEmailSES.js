const { SendEmailCommand, SESClient } = require("@aws-sdk/client-ses");

// Set the AWS Region.
const REGION = "us-east-1";
const accessKeyId = process.env.AWS_SES_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
// Create SES service object.
const sesClient = new SESClient({ region: REGION, credentials: { accessKeyId, secretAccessKey} });

const createSendEmailCommand = (toEmail, fromEmail, subject, template) => {
  return new SendEmailCommand({
    Destination: {
      /* required */
      CcAddresses: [],
      ToAddresses: [toEmail],
    },
    Message: {
      /* required */
      Body: {
        /* required */
        Html: {
          Charset: "UTF-8",
          Data: template,
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: subject,
      },
    },
    Source: fromEmail,
    ReplyToAddresses: [
      /* more items */
    ],
  });
};

const sendEmailSES = async (toEmail, fromEmail, subject, template) => {
  const sendEmailCommand = createSendEmailCommand(
    toEmail,
    fromEmail,
    subject,
    template
  );

  try {
    return await sesClient.send(sendEmailCommand);
  } catch (caught) {
    console.log(caught)
    return caught;
  }
};

module.exports = sendEmailSES;