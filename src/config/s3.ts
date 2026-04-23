import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

const client = new S3Client({
  endpoint: env.s3Endpoint,
  region: env.s3Region,
  credentials: {
    accessKeyId: env.s3AccessKey,
    secretAccessKey: env.s3SecretKey,
  },
});

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType = "image/png",
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return `${env.s3Endpoint}/${env.s3Bucket}/${key}`;
}
