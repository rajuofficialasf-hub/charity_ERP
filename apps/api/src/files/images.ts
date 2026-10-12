/**
 * Photo bytes from a client (plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md,
 * R4; NE-SEC-07): the type is taken from the magic bytes, never from the name or the header, and
 * metadata that can carry the place or the device (JPEG APP1 Exif/XMP, APP13 IPTC and comments;
 * PNG text, eXIf and tIME chunks) is removed. No image library: only the container is walked,
 * the pixels are copied untouched.
 */
export type ImageMime = 'image/jpeg' | 'image/png';

export interface CleanImage {
  mime: ImageMime;
  bytes: Buffer;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROPPED = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
/** APP1 (Exif, XMP), APP13 (IPTC) and COM. */
const JPEG_DROPPED = new Set([0xe1, 0xed, 0xfe]);
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/** The cleaned image, or null when the bytes are not a well-formed JPEG or PNG container. */
export function cleanImage(input: Buffer): CleanImage | null {
  if (input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff)
    return wrap('image/jpeg', cleanJpeg(input));
  if (input.length > PNG_SIGNATURE.length && input.subarray(0, 8).equals(PNG_SIGNATURE))
    return wrap('image/png', cleanPng(input));
  return null;
}

function wrap(mime: ImageMime, bytes: Buffer | null): CleanImage | null {
  return bytes ? { mime, bytes } : null;
}

function cleanJpeg(input: Buffer): Buffer | null {
  const parts: Buffer[] = [input.subarray(0, 2)];
  let at = 2;
  while (at + 4 <= input.length) {
    if (input.readUInt8(at) !== 0xff) return null;
    const marker = input.readUInt8(at + 1);
    if (marker === JPEG_EOI) return null; // an image ends only after its scan
    const length = input.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > input.length) return null;
    if (marker === JPEG_SOS) {
      // the entropy-coded scan and everything after it are copied as they are
      parts.push(input.subarray(at));
      return Buffer.concat(parts);
    }
    if (!JPEG_DROPPED.has(marker)) parts.push(input.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  return null;
}

function cleanPng(input: Buffer): Buffer | null {
  const parts: Buffer[] = [PNG_SIGNATURE];
  let at = PNG_SIGNATURE.length;
  while (at + 12 <= input.length) {
    const length = input.readUInt32BE(at);
    const end = at + 12 + length;
    if (end > input.length) return null;
    const type = input.toString('latin1', at + 4, at + 8);
    if (!PNG_DROPPED.has(type)) parts.push(input.subarray(at, end));
    at = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  return null;
}
