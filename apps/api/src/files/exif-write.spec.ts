import { Readable } from 'node:stream';
import { crc32 } from 'node:zlib';
import exifr from 'exifr';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { readPhotoMetadata } from './exif.js';
import { metadataWriter, UnreadablePhoto, webpLayout, type WrittenMetadata } from './exif-write.js';

const TAKEN = new Date('2026-10-20T08:05:30.000Z');
const META: WrittenMetadata = {
  capturedAt: TAKEN,
  gps: { lat: 23.810331, lng: 90.412521, accuracyM: 12.5 },
};

const base = () => sharp({ create: { width: 64, height: 48, channels: 3, background: '#3a6b8c' } });

/** Feeds the bytes in pieces of `size` and collects what the writer gives back. */
async function write(
  input: Buffer,
  mime: 'image/jpeg' | 'image/png' | 'image/webp',
  meta: WrittenMetadata = META,
  size = 4096,
): Promise<Buffer> {
  const pieces = () => {
    const out: Buffer[] = [];
    for (let at = 0; at < input.length; at += size) out.push(input.subarray(at, at + size));
    return Readable.from(out);
  };
  const layout = mime === 'image/webp' ? await webpLayout(pieces(), input.length) : undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of pieces().pipe(metadataWriter(mime, meta, layout)))
    chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const pixels = (bytes: Buffer) => sharp(bytes).raw().toBuffer();

/**
 * The EXIF a reader finds in the written file. exifr reads no WebP, so the block of a WebP's EXIF
 * chunk is read as the TIFF it is; libvips reading the same chunk shows the chunk is where it
 * belongs.
 */
async function exifOf(bytes: Buffer): Promise<Buffer> {
  if (bytes.toString('latin1', 8, 12) !== 'WEBP') return bytes;
  expect((await sharp(bytes).metadata()).exif).toBeDefined();
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(at + 4);
    if (bytes.toString('latin1', at, at + 4) === 'EXIF')
      return bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size & 1);
  }
  return Buffer.alloc(0);
}
const readBack = async (bytes: Buffer) => readPhotoMetadata(await exifOf(bytes));

const pngChunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
};

describe('the capture time and the position written into a downloaded photo', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp'] as const) {
    it(`reads back the same time and place from a ${mime}, with the pixels unchanged`, async () => {
      const format = mime.slice(6) as 'jpeg' | 'png' | 'webp';
      const input = await base().toFormat(format).toBuffer();
      const out = await write(input, mime);
      expect(await readBack(out)).toEqual({
        capturedAt: TAKEN,
        gps: { lat: expect.closeTo(23.810331, 6), lng: expect.closeTo(90.412521, 6) },
      });
      const tags = (await exifr.parse(await exifOf(out), { pick: ['GPSHPositioningError'] })) as {
        GPSHPositioningError: number;
      };
      expect(tags.GPSHPositioningError).toBeCloseTo(12.5, 2);
      expect(await pixels(out)).toEqual(await pixels(input));
    });
  }

  it('writes the south and the west as such', async () => {
    const input = await base().jpeg().toBuffer();
    const out = await write(input, 'image/jpeg', {
      capturedAt: TAKEN,
      gps: { lat: -33.868819, lng: -151.209295, accuracyM: null },
    });
    expect((await readBack(out)).gps).toEqual({
      lat: expect.closeTo(-33.868819, 6),
      lng: expect.closeTo(-151.209295, 6),
    });
  });

  it('writes the time alone for a caller who may not see the position', async () => {
    const input = await base().png().toBuffer();
    const out = await write(input, 'image/png', { capturedAt: TAKEN, gps: null });
    expect(await readBack(out)).toEqual({ capturedAt: TAKEN, gps: null });
  });

  it('writes nothing new and still strips what the photo held when nothing is known', async () => {
    const input = await base()
      .jpeg()
      .withExif({
        IFD0: { Make: 'Phone' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 0/1 0/1' },
      })
      .toBuffer();
    const out = await write(input, 'image/jpeg', { capturedAt: null, gps: null });
    expect(await readBack(out)).toEqual({ capturedAt: null, gps: null });
    expect(out.includes(Buffer.from('Phone'))).toBe(false);
  });

  it('keeps only the written metadata of a JPEG and a WebP that held their own', async () => {
    const held = {
      IFD0: { Make: 'Phone' },
      IFD2: { DateTimeOriginal: '2020:01:01 00:00:00' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '10/1 0/1 0/1' },
    };
    for (const [mime, input] of [
      ['image/jpeg', await base().jpeg().withExif(held).toBuffer()],
      ['image/webp', await base().webp().withExif(held).toBuffer()],
    ] as const) {
      const out = await write(input, mime);
      expect(await readBack(out)).toMatchObject({ capturedAt: TAKEN });
      expect(out.includes(Buffer.from('Phone'))).toBe(false);
    }
  });

  it('drops a PNG text chunk written after the image data', async () => {
    const input = await base().png().toBuffer();
    const iend = input.length - 12;
    const tagged = Buffer.concat([
      input.subarray(0, iend),
      pngChunk('tEXt', Buffer.from('Location\0Dhaka home', 'latin1')),
      input.subarray(iend),
    ]);
    const out = await write(tagged, 'image/png');
    expect(out.includes(Buffer.from('Dhaka home'))).toBe(false);
    expect(await pixels(out)).toEqual(await pixels(input));
  });

  it('writes into a lossless WebP, which has no extended header of its own', async () => {
    const input = await base().webp({ lossless: true }).toBuffer();
    const out = await write(input, 'image/webp');
    expect((await readBack(out)).capturedAt).toEqual(TAKEN);
    expect(await pixels(out)).toEqual(await pixels(input));
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
  });

  it('gives the same bytes when the photo arrives one byte at a time', async () => {
    for (const [mime, input] of [
      ['image/jpeg', await base().jpeg({ progressive: true }).toBuffer()],
      ['image/png', await base().png().toBuffer()],
      ['image/webp', await base().webp().toBuffer()],
    ] as const)
      expect(await write(input, mime, META, 1)).toEqual(await write(input, mime));
  });
});

describe('a stored photo the writer refuses', () => {
  const refused = (promise: Promise<unknown>) =>
    expect(promise).rejects.toBeInstanceOf(UnreadablePhoto);

  it('refuses a JPEG segment whose length runs past the end', async () => {
    const input = await base().jpeg().toBuffer();
    await refused(write(input.subarray(0, 12), 'image/jpeg'));
  });

  it('refuses a JPEG cut off inside its image data', async () => {
    const input = await base().jpeg().toBuffer();
    await refused(write(input.subarray(0, input.length - 40), 'image/jpeg'));
  });

  it('refuses more than a megabyte of metadata before the image data', async () => {
    const input = await base().jpeg().toBuffer();
    const segment = Buffer.alloc(65_535);
    segment.writeUInt16BE(0xffe2, 0);
    segment.writeUInt16BE(65_533, 2);
    const padded = Buffer.concat([
      input.subarray(0, 2),
      ...Array.from({ length: 17 }, () => segment),
      input.subarray(2),
    ]);
    await refused(write(padded, 'image/jpeg'));
  });

  it('refuses a PNG chunk whose length runs past the end', async () => {
    const input = Buffer.from(await base().png().toBuffer());
    input.writeUInt32BE(0x7fff_0000, 8);
    await refused(write(input, 'image/png'));
  });

  it('refuses a WebP whose RIFF length disagrees with its size', async () => {
    const input = Buffer.from(await base().webp().toBuffer());
    input.writeUInt32LE(input.readUInt32LE(4) + 100, 4);
    await refused(write(input, 'image/webp'));
  });

  it('refuses bytes that are not the type the file was stored as', async () => {
    await refused(write(await base().png().toBuffer(), 'image/jpeg'));
  });
});
