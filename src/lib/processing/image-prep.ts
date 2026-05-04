import "server-only";

import sharp from "sharp";

export interface ImageMetricsResult {
  buffer: Buffer;
  contentType: string;
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  rotated: boolean;
  likelyScreenshot: boolean;
  aspectRatio: number;
}

/**
 * Normalises an image for storage and downstream OCR. Auto-rotates by EXIF,
 * downscales massive photos, and computes simple quality heuristics that the
 * mock processor can use when Document AI isn't configured.
 */
export async function normaliseImage(buffer: Buffer, _mime: string): Promise<ImageMetricsResult> {
  const pipeline = sharp(buffer, { failOn: "error" }).rotate();

  const meta = await pipeline.metadata();
  const targetMime = "image/jpeg";

  const out = await pipeline.resize({ width: 2400, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();

  const stats = await sharp(out).stats();
  const channelMeans = stats.channels.slice(0, 3).map((c) => c.mean);
  const brightness = channelMeans.reduce((a, b) => a + b, 0) / Math.max(channelMeans.length, 1) / 255;
  const stdevs = stats.channels.slice(0, 3).map((c) => c.stdev);
  const contrast = stdevs.reduce((a, b) => a + b, 0) / Math.max(stdevs.length, 1) / 255;

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const aspectRatio = width && height ? width / height : 1;

  // Common phone screenshot aspect ratios: 9:16 (iPhone), 9:19.5 (newer iPhones), 9:18, 9:20.
  const likelyScreenshot =
    width > 0 &&
    height > 0 &&
    aspectRatio > 0 &&
    (Math.abs(aspectRatio - 9 / 16) < 0.04 ||
      Math.abs(aspectRatio - 9 / 19.5) < 0.04 ||
      Math.abs(aspectRatio - 9 / 20) < 0.04);

  const rotated = (meta.orientation ?? 1) > 1;

  return {
    buffer: out,
    contentType: targetMime,
    width,
    height,
    brightness,
    contrast,
    rotated,
    likelyScreenshot,
    aspectRatio,
  };
}

/** Generates a 600px max thumbnail JPEG. */
export async function makeThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}
