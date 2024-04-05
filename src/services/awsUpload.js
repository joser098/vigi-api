const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");

const uploadToAws = async (file, id, username) => {
  const region = process.env.AWS_BUCKET_REGION;
  const bucketName = process.env.AWS_BUCKET_NAME;
  const accessKeyId = process.env.AWS_ACCESS_KEY;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const stream = fs.createReadStream(file.path);

  await s3Client.send(
    new PutObjectCommand({
      CacheControl: "max-age=5",
      ContentType: file.mimetype,
      Bucket: bucketName,
      Key: `profile/${id}-${username}.png`,
      Body: stream,
    })
  );
};

module.exports = uploadToAws;
