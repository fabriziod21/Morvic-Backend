const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('crypto');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME || 'morvic-imagenes';

async function subirImagen(file) {
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.originalname}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${fileName}`;
}

module.exports = { s3, subirImagen, BUCKET };
