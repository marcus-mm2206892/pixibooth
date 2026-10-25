// Captured-photo lifecycle: creation, decoding (cached) and cleanup.

import type { CapturedPhoto, FilterId } from "./session";
import { randomId } from "./session";
import { applyFilter } from "./filters";
import { canvasToBlob, coverCrop, get2d, hashString, makeCanvas, releaseCanvas } from "./canvas";

export type PhotoSource = {
  image: CanvasImageSource;
  width: number;
  height: number;
  /** Stable per-photo seed for deterministic grain. */
  seed: number;
};

const decoded = new Map<string, Promise<PhotoSource>>();

export function makeCapturedPhoto(frame: { blob: Blob; width: number; height: number }): CapturedPhoto {
  return {
    id: randomId(),
    blob: frame.blob,
    previewUrl: URL.createObjectURL(frame.blob),
    capturedAt: Date.now(),
    width: frame.width,
    height: frame.height,
  };
}

export function releasePhoto(photo: CapturedPhoto | null): void {
  if (!photo) return;
  decoded.delete(photo.id);
  URL.revokeObjectURL(photo.previewUrl);
}

export function decodePhoto(photo: CapturedPhoto): Promise<PhotoSource> {
  let pending = decoded.get(photo.id);
  if (!pending) {
    const seed = hashString(photo.id);
    pending = decodeBlob(photo).then((image) => ({
      image,
      width: photo.width,
      height: photo.height,
      seed,
    }));
    decoded.set(photo.id, pending);
    pending.catch(() => decoded.delete(photo.id));
  }
  return pending;
}

async function decodeBlob(photo: CapturedPhoto): Promise<CanvasImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(photo.blob);
    } catch {
      // fall through to <img> decoding
    }
  }
  const img = new Image();
  img.decoding = "async";
  img.src = photo.previewUrl;
  await img.decode();
  return img;
}

/** Draws one photo (cover-cropped to the canvas aspect) with the filter applied. */
export function drawFilteredPhoto(
  canvas: HTMLCanvasElement,
  source: PhotoSource,
  filter: FilterId,
): void {
  const ctx = get2d(canvas);
  const { width: w, height: h } = canvas;
  const crop = coverCrop(source.width, source.height, w / h);
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
  applyFilter(ctx, w, h, filter, source.seed);
}

/** Full-resolution individual photo with the session filter baked in. */
export async function renderPhotoJpeg(photo: CapturedPhoto, filter: FilterId): Promise<Blob> {
  if (filter === "none") return photo.blob;
  const source = await decodePhoto(photo);
  const canvas = makeCanvas(photo.width, photo.height);
  try {
    drawFilteredPhoto(canvas, source, filter);
    return await canvasToBlob(canvas, "image/jpeg", 0.92);
  } finally {
    releaseCanvas(canvas);
  }
}
