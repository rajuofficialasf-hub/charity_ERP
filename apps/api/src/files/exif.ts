import exifr from 'exifr';

/** What a photo's own metadata says about where and when it was taken. */
export interface PhotoMetadata {
  capturedAt: Date | null;
  gps: { lat: number; lng: number } | null;
}

const NONE: PhotoMetadata = { capturedAt: null, gps: null };

/**
 * The capture time and the position from a photo's EXIF block, when the photo still has them (a
 * phone's compression or the operating system may strip them). Only these fields are read; a
 * damaged or missing block gives nothing, never an error. The time is taken with its offset when
 * the camera wrote one; without it the phone's local time is read as Bangladesh time.
 */
export async function readPhotoMetadata(bytes: Buffer): Promise<PhotoMetadata> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = (await exifr.parse(bytes, {
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'OffsetTimeOriginal',
        'GPSLatitude',
        'GPSLatitudeRef',
        'GPSLongitude',
        'GPSLongitudeRef',
      ],
      gps: true,
      reviveValues: false,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
  } catch {
    return NONE;
  }
  if (!tags) return NONE;
  return {
    capturedAt: captureTime(tags.DateTimeOriginal ?? tags.CreateDate, tags.OffsetTimeOriginal),
    gps: position(tags.latitude, tags.longitude),
  };
}

const EXIF_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

/** `2026:10:20 14:05:00` with an optional `+06:00`; the offset defaults to Bangladesh time. */
function captureTime(value: unknown, offset: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = EXIF_TIME.exec(value);
  if (!m) return null;
  const zone = typeof offset === 'string' && OFFSET.test(offset) ? offset : '+06:00';
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function position(lat: unknown, lng: unknown): PhotoMetadata['gps'] {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}
