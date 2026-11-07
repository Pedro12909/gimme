import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import * as crypto from "node:crypto";

// Item photos uploaded by owners. The browser resizes them and uploads straight to S3 under
// pending/, which is never served. Saving the item copies the upload to images/, the only
// prefix CloudFront serves. Unsaved uploads expire through a lifecycle rule.

const s3 = new S3Client();
const bucket = process.env["IMAGES_BUCKET_NAME"] ?? "";
// Images are served from the site's own domain, e.g. https://gimme.rtemis.dev/images/<id>.webp
const publicBaseUrl = process.env["IMAGES_BASE_URL"] ?? "";

// The browser sends about 100-250 KB; this cap is for clients that skip the resize
const MAX_UPLOAD_BYTES = 1024 * 1024;

// No SVG or anything else a browser might run: only these two types are ever accepted or served
const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
};
const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
};

const PENDING_KEY = /^pending\/([^/]+)\/([0-9a-f-]{36})\.(webp|jpg)$/;

// A short-lived form the browser posts the file to. S3 enforces the size and type itself.
export async function createUpload(listId: string, contentType: unknown) {
  const extension =
    typeof contentType === "string" ? EXTENSIONS[contentType] : undefined;
  if (!extension) return undefined;

  const key = `pending/${listId}/${crypto.randomUUID()}.${extension}`;
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Conditions: [["content-length-range", 1, MAX_UPLOAD_BYTES]],
    Fields: { "Content-Type": contentType as string },
    Expires: 300,
  });

  return { key, url, fields };
}

// Copies a finished upload for this list to the public prefix. Returns undefined when the key
// isn't a pending upload for this list, or the upload never arrived.
export async function publishUpload(
  listId: string,
  pendingKey: string,
  ownerId: string,
) {
  const match = PENDING_KEY.exec(pendingKey);
  if (!match || match[1] !== listId) return undefined;

  const [, , id, extension] = match;
  const imageKey = `images/${id}.${extension}`;

  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: imageKey,
        CopySource: `${bucket}/${pendingKey}`,
        // Headers are set here, not taken from the upload
        MetadataDirective: "REPLACE",
        ContentType: CONTENT_TYPES[extension],
        // Every upload gets a new key, so a URL's content never changes
        CacheControl: "public, max-age=31536000, immutable",
        // Lets a reported image be traced back to its owner and list
        Metadata: { owner: ownerId, list: listId },
      }),
    );
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    if (status === 404) return undefined;
    throw err;
  }

  // Removing the upload stops it being attached twice. If this fails, the lifecycle rule
  // still removes it within a day.
  await s3
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: pendingKey }))
    .catch((err) => console.error("Failed to delete upload", pendingKey, err));

  return { imageKey, imageUrl: `${publicBaseUrl}/${imageKey}` };
}

// Best effort: a failure only leaves an unreferenced file behind, so it's logged, not raised
export async function deleteImages(keys: unknown[]) {
  const objects = keys
    .filter((key): key is string => typeof key === "string" && key !== "")
    .map((Key) => ({ Key }));
  if (objects.length === 0) return;

  try {
    // Lists hold at most 50 items, well under the 1,000 keys one request allows
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
    if (result.Errors?.length) {
      console.error("Failed to delete images", result.Errors);
    }
  } catch (err) {
    console.error("Failed to delete images", err);
  }
}

const IMAGE_KEY = /^images\/[0-9a-f-]{36}\.(webp|jpg)$/;

// A copied item gets its own copy of an uploaded photo. Deleting an item deletes its photo,
// so two items must never share one. Returns undefined if the photo can't be copied.
export async function copyImage(
  imageKey: string,
  ownerId: string,
  listId: string,
) {
  const match = IMAGE_KEY.exec(imageKey);
  if (!match) return undefined;

  const extension = match[1];
  const copyKey = `images/${crypto.randomUUID()}.${extension}`;
  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: copyKey,
        CopySource: `${bucket}/${imageKey}`,
        MetadataDirective: "REPLACE",
        ContentType: CONTENT_TYPES[extension],
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { owner: ownerId, list: listId },
      }),
    );
  } catch (err) {
    console.error("Failed to copy image", imageKey, err);
    return undefined;
  }

  return { imageKey: copyKey, imageUrl: `${publicBaseUrl}/${copyKey}` };
}
