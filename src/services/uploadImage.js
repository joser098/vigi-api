const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const uploadImage = async (file, id, username) => {
  const key = `profile/${id}-${username}.png`;

  // R2 rejects aws-chunked streaming, so the file is sent as a buffer.
  const body = fs.readFileSync(file.path);

  await s3Client.send(
    new PutObjectCommand({
      CacheControl: "max-age=5",
      ContentType: file.mimetype,
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
    })
  );

  return `${process.env.R2_PUBLIC_URL}/${key}`;
};

module.exports = uploadImage;
