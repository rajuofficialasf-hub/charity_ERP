import sharp, { type Metadata } from 'sharp';

// the worker decodes one photo at a time and keeps no decoded images between files
sharp.cache(false);
sharp.concurrency(1);

/** Images above this many pixels are never decoded (a small file can claim a huge canvas). */
export const MAX_INPUT_PIXELS = 40_000_000;
/** The thumbnails of a photo: 320 px for lists, 1,024 px for the verification view. */
export const THUMBNAILS = { small: 320, medium: 1024 } as const;
/** Two photos whose difference hashes differ in at most this many bits are near duplicates. */
export const NEAR_DUPLICATE_BITS = 6;

/** The formats the processing decodes; anything else is refused before a pixel is read. */
const DECODED = new Set(['jpeg', 'png', 'webp']);

/** The image is not one the processing may decode: too many pixels or another format. */
export class ImageRefused extends Error {
  constructor(readonly reason: 'too_large' | 'format') {
    super(`image refused: ${reason}`);
    this.name = 'ImageRefused';
  }
}

const open = (bytes: Buffer) =>
  sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error', sequentialRead: true });

/**
 * Checks the header only: the declared size of the canvas and the format, so an oversized or
 * unexpected image is refused before it is decoded.
 */
export async function checkImage(bytes: Buffer): Promise<void> {
  let meta: Metadata;
  try {
    meta = await open(bytes).metadata();
  } catch (error) {
    // sharp refuses a canvas over the limit from the header alone; anything else is damaged
    throw new ImageRefused(/pixel limit/i.test(String(error)) ? 'too_large' : 'format');
  }
  if (!meta.format || !DECODED.has(meta.format)) throw new ImageRefused('format');
  if (!meta.width || !meta.height || meta.width * meta.height > MAX_INPUT_PIXELS)
    throw new ImageRefused('too_large');
}

/** A JPEG thumbnail whose longest edge is at most `edge` pixels, turned upright, without metadata. */
export function thumbnail(bytes: Buffer, edge: number): Promise<Buffer> {
  return open(bytes)
    .rotate()
    .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

/**
 * The 64-bit difference hash of a photo: the image shrunk to 9 x 8 grey pixels, one bit per pair of
 * neighbours in a row (left brighter than right). Resizing, compression and small edits change few
 * bits; another photo changes about half. Returned as a signed 64-bit value for the database.
 */
export async function differenceHash(bytes: Buffer): Promise<bigint> {
  const pixels = await open(bytes)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  let hash = 0n;
  for (let row = 0; row < 8; row += 1)
    for (let col = 0; col < 8; col += 1) {
      const left = pixels[row * 9 + col]!;
      const right = pixels[row * 9 + col + 1]!;
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  return BigInt.asIntN(64, hash);
}

/** How many bits two hashes differ in. */
export function hammingDistance(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let bits = 0;
  while (x) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}
