/**
 * Photo bytes from a client: the type is taken from the magic bytes, never from the name or the
 * header, and metadata that can carry the place or the device (JPEG APP1 to APP15 except Adobe,
 * comments and anything after the end of the image; PNG text, eXIf and tIME chunks) is removed. No
 * image library: only the container is walked, the pixels are copied untouched.
 */
export type ImageMime = 'image/jpeg' | 'image/png';

export interface CleanImage {
  mime: ImageMime;
  bytes: Buffer;
}

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PNG_DROPPED = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;
/** APP1 to APP15 (Exif, XMP, ICC, multi-picture, IPTC, ...) and COM, except JFIF APP0 and Adobe APP14. */
export const jpegDropped = (marker: number) =>
  marker === 0xfe || (marker >= 0xe1 && marker <= 0xef && marker !== 0xee);
/** Inside scan data, FF 00 is a stuffed byte and FF D0 to FF D7 are restart markers. */
export const scanByte = (next: number) => next === 0 || (next >= 0xd0 && next <= 0xd7);

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

/**
 * Walks every marker segment, also between the scans of a progressive JPEG, keeps the scan data
 * and stops at the end-of-image marker: anything appended after it (a second image, a motion clip,
 * a trailer with its own Exif) is dropped.
 */
function cleanJpeg(input: Buffer): Buffer | null {
  const parts: Buffer[] = [input.subarray(0, 2)];
  let scanned = false;
  let at = 2;
  while (at + 2 <= input.length) {
    if (input.readUInt8(at) !== 0xff) return null;
    const marker = input.readUInt8(at + 1);
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === JPEG_EOI) {
      if (!scanned) return null; // an image ends only after its scan
      parts.push(input.subarray(at, at + 2));
      return Buffer.concat(parts);
    }
    if (at + 4 > input.length) return null;
    const end = at + 2 + input.readUInt16BE(at + 2);
    if (end < at + 4 || end > input.length) return null;
    if (!jpegDropped(marker)) parts.push(input.subarray(at, end));
    at = end;
    if (marker === JPEG_SOS) {
      let next = at;
      while (
        next + 1 < input.length &&
        !(input.readUInt8(next) === 0xff && !scanByte(input.readUInt8(next + 1)))
      )
        next += 1;
      if (next + 1 >= input.length) return null;
      parts.push(input.subarray(at, next));
      scanned = true;
      at = next;
    }
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
