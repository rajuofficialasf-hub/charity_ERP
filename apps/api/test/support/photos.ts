import { crc32 } from 'node:zlib';
import sharp from 'sharp';

/**
 * Real photos for the processing tests, made with sharp: a photo whose EXIF block carries a
 * capture time and a position, smooth pictures whose resized copies are near duplicates, and a PNG
 * whose header claims a canvas over 40 megapixels.
 */

/** A smooth picture: a diagonal gradient with a bright square, different per `variant`. */
export async function picture(
  options: { width?: number; variant?: number; quality?: number } = {},
): Promise<Buffer> {
  const width = options.width ?? 640;
  const height = Math.round((width * 3) / 4);
  const variant = options.variant ?? 0;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const v = y / height;
      // each variant puts its bright square and its gradient direction elsewhere
      const square =
        Math.abs(u - (0.2 + 0.15 * (variant % 5))) < 0.12 &&
        Math.abs(v - (0.3 + 0.1 * (variant % 4))) < 0.15;
      const base = variant % 2 === 0 ? (u + v) / 2 : (1 - u + v) / 2;
      const value = Math.round(255 * (square ? 1 - base : base));
      const at = (y * width + x) * 3;
      raw[at] = value;
      raw[at + 1] = (value + 40 * variant) % 256;
      raw[at + 2] = 255 - value;
    }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: options.quality ?? 85 })
    .toBuffer();
}

/** A photo with a capture time and a position in its EXIF block (a phone that kept them). */
export function photoWithExif(
  taken = '2026:10:20 14:05:00',
  position = { lat: '23/1 48/1 3700/100', lng: '90/1 24/1 4500/100' },
): Promise<Buffer> {
  return sharp({ create: { width: 96, height: 72, channels: 3, background: '#4a7a5a' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'Test' },
      IFD2: { DateTimeOriginal: taken, OffsetTimeOriginal: '+06:00' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: position.lat,
        GPSLongitudeRef: 'E',
        GPSLongitude: position.lng,
      },
    })
    .toBuffer();
}

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
};

/** A small PNG whose header claims 8,000 x 6,000 pixels (48 megapixels); its pixels are missing. */
export function oversizedPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(8000, 0);
  header.writeUInt32BE(6000, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', Buffer.from([0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
