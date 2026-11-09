import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { oversizedPng, photoWithExif, picture } from '../../test/support/photos';
import { readPhotoMetadata } from './exif';
import { photoFlags } from './flags';
import {
  checkImage,
  differenceHash,
  hammingDistance,
  ImageRefused,
  NEAR_DUPLICATE_BITS,
  thumbnail,
} from './images-process';

// The photo processing: metadata, thumbnails, the difference hash and the data-quality flags.
describe('the metadata of a photo', () => {
  it('reads the capture time with its offset and the position', async () => {
    const meta = await readPhotoMetadata(await photoWithExif());
    expect(meta.capturedAt?.toISOString()).toBe('2026-10-20T08:05:00.000Z');
    expect(meta.gps?.lat).toBeCloseTo(23.8103, 3);
    expect(meta.gps?.lng).toBeCloseTo(90.4125, 3);
  });

  it('gives nothing for a photo without metadata and for bytes that are not a photo', async () => {
    expect(await readPhotoMetadata(await picture())).toEqual({ capturedAt: null, gps: null });
    expect(await readPhotoMetadata(Buffer.from('%PDF-1.7'))).toEqual({
      capturedAt: null,
      gps: null,
    });
  });
});

describe('thumbnails and the difference hash', () => {
  it('makes a JPEG thumbnail no larger than its edge', async () => {
    const small = await thumbnail(await picture({ width: 1200 }), 320);
    const meta = await sharp(small).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width!, meta.height!)).toBe(320);
  });

  it('keeps resized copies of a photo within the near-duplicate distance, and others outside', async () => {
    const original = await differenceHash(await picture({ width: 1200, variant: 1 }));
    const smaller = await differenceHash(await picture({ width: 400, variant: 1, quality: 50 }));
    expect(hammingDistance(original, smaller)).toBeLessThanOrEqual(NEAR_DUPLICATE_BITS);
    const other = await differenceHash(await picture({ width: 1200, variant: 2 }));
    expect(hammingDistance(original, other)).toBeGreaterThan(NEAR_DUPLICATE_BITS);
  });

  it('refuses a header that claims over 40 megapixels before any pixel is decoded', async () => {
    await expect(checkImage(oversizedPng())).rejects.toBeInstanceOf(ImageRefused);
    await expect(checkImage(await picture())).resolves.toBeUndefined();
  });

  it('refuses a format it does not decode and damaged bytes, as a refusal of the format', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .gif()
      .toBuffer();
    for (const bytes of [gif, Buffer.from('not an image at all')])
      await expect(checkImage(bytes)).rejects.toMatchObject({ reason: 'format' });
  });
});

describe('the data-quality flags of a photo', () => {
  const base = {
    kind: 'distribution_proof',
    mime: 'image/jpeg',
    capturedAt: new Date('2026-10-20T08:00:00Z'),
    hasPosition: true,
    recordCreatedAt: new Date('2026-10-20T08:05:00Z'),
    receivedAt: new Date('2026-10-20T09:00:00Z'),
    source: 'camera',
    projectSource: 'camera_only' as const,
  };

  it('flags what is missing, a stale or impossible capture, and the gallery under camera only', () => {
    expect(photoFlags(base)).toEqual([]);
    expect(photoFlags({ ...base, capturedAt: null, hasPosition: false })).toEqual([
      'no_capture_time',
      'no_gps',
    ]);
    expect(photoFlags({ ...base, recordCreatedAt: new Date('2026-10-20T08:11:00Z') })).toEqual([
      'stale_capture',
    ]);
    expect(
      photoFlags({ ...base, capturedAt: new Date('2026-10-20T09:20:00Z'), recordCreatedAt: null }),
    ).toEqual(['stale_capture']);
    expect(photoFlags({ ...base, source: 'gallery' })).toEqual(['gallery_under_camera_only']);
    expect(photoFlags({ ...base, source: 'gallery', projectSource: 'camera_or_gallery' })).toEqual(
      [],
    );
  });

  it('flags nothing on a document or a PDF', () => {
    expect(photoFlags({ ...base, kind: 'document', capturedAt: null })).toEqual([]);
    expect(photoFlags({ ...base, mime: 'application/pdf', hasPosition: false })).toEqual([]);
  });
});
