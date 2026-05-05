import "server-only";

import heicConvert from "heic-convert";

/** Converts a HEIC/HEIF buffer to JPEG. Returns null if the conversion fails. */
export async function heicToJpeg(buffer: Buffer): Promise<Buffer | null> {
  try {
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const result = await heicConvert({
      buffer: ab,
      format: "JPEG",
      quality: 0.86,
    });
    return Buffer.from(result);
  } catch (error) {
    console.error("[heic] conversion failed", error);
    return null;
  }
}
