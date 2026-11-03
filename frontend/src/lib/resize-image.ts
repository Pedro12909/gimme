// Photos are shrunk in the browser before upload, so any phone photo works and the file
// that leaves the device is small. Redrawing also drops metadata such as GPS location.

// Thumbnails are small; this leaves room for larger views later
const MAX_DIMENSION = 1024;
// Bigger files are almost certainly not photos, and decoding them can exhaust a phone's memory
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export class ImageReadError extends Error {}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function resizeImage(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageReadError("That file is too big. Pick a photo instead.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageReadError("Couldn't read that image. Try a JPEG or PNG.");
  }

  const scale = Math.min(
    1,
    MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new ImageReadError("Couldn't process that image.");
  // Thumbnails sit on a white tile, and JPEG has no transparency
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Browsers that can't encode WebP hand back a PNG instead, so check and fall back to JPEG
  const webp = await toBlob(canvas, "image/webp", 0.82);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
  if (jpeg?.type === "image/jpeg") return jpeg;
  throw new ImageReadError("Couldn't process that image.");
}
