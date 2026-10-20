/** What a photo's own metadata says about when and where it was taken. */
export interface PhotoMeta {
  /** ISO time with its offset, as the API expects it. */
  capturedAt?: string;
  gps?: { lat: number; lng: number };
}

const EXIF_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const OFFSET = /^[+-]\d{2}:\d{2}$/;

/**
 * The capture time and the position from a photo's EXIF block, read before the photo is
 * compressed (drawing on a canvas drops the metadata). The reader loads with the upload, never
 * with the first page. A photo without metadata, or a file that is not a photo, gives nothing. A
 * time without its offset is read as Bangladesh time.
 */
export async function readPhotoMeta(file: Blob): Promise<PhotoMeta> {
  if (!file.type.startsWith('image/')) return {};
  try {
    const { default: exifr } = await import('exifr');
    const tags = (await exifr.parse(file, {
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
    if (!tags) return {};
    const meta: PhotoMeta = {};
    const taken = captureTime(tags.DateTimeOriginal ?? tags.CreateDate, tags.OffsetTimeOriginal);
    if (taken) meta.capturedAt = taken;
    const { latitude: lat, longitude: lng } = tags;
    if (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180 &&
      !(lat === 0 && lng === 0)
    )
      meta.gps = { lat, lng };
    return meta;
  } catch {
    return {};
  }
}

function captureTime(value: unknown, offset: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const m = EXIF_TIME.exec(value);
  if (!m) return undefined;
  const zone = typeof offset === 'string' && OFFSET.test(offset) ? offset : '+06:00';
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${zone}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
