import "server-only";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME ?? "xsta360-documents";
const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

function getS3Client(): S3Client {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Build the R2 object key for a document.
 * Format: orgs/{orgId}/{docId}/{fileName}
 */
export function buildR2Key(orgId: string, docId: string, fileName: string): string {
  // Sanitize filename — keep it readable but safe as a path segment.
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `orgs/${orgId}/${docId}/${safeName}`;
}

/**
 * Build the public URL for a document (if the bucket has public access enabled).
 */
export function buildPublicUrl(r2Key: string): string | null {
  if (!publicUrl) return null;
  return `${publicUrl}/${r2Key}`;
}

/**
 * Upload a file to R2. Returns the R2 key.
 */
export async function uploadToR2(params: {
  orgId: string;
  docId: string;
  fileName: string;
  mimeType: string;
  body: Buffer | Uint8Array;
}): Promise<string> {
  const key = buildR2Key(params.orgId, params.docId, params.fileName);
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: params.body,
      ContentType: params.mimeType,
    }),
  );

  return key;
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(r2Key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: r2Key,
    }),
  );
}

/**
 * Generate a presigned download URL (valid for 1 hour).
 * Used when the bucket is not public.
 */
export async function getPresignedDownloadUrl(r2Key: string): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: r2Key,
  });
  return getSignedUrl(client, command, { expiresIn: 3600 });
}

/**
 * Generate a presigned upload URL (valid for 10 minutes).
 * Allows the client to upload directly to R2 without the file passing through the server.
 */
export async function getPresignedUploadUrl(params: {
  orgId: string;
  docId: string;
  fileName: string;
  mimeType: string;
}): Promise<{ uploadUrl: string; r2Key: string }> {
  const r2Key = buildR2Key(params.orgId, params.docId, params.fileName);
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: r2Key,
    ContentType: params.mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
  return { uploadUrl, r2Key };
}

/**
 * Get the download URL for a document.
 * If the bucket is public, returns the public URL.
 * Otherwise, generates a presigned URL.
 */
export async function getDownloadUrl(r2Key: string, publicUrl?: string | null): Promise<string> {
  if (publicUrl) return publicUrl;
  return getPresignedDownloadUrl(r2Key);
}
