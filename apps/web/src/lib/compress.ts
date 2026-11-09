import { PHOTO_TARGET_BYTES } from '@css/shared/sync';

/** Longest side of a photo after compression; enough for a face and an NID card. */
const MAX_SIDE = 1600;
/** The qualities tried in turn until the photo is small enough. */
const QUALITIES = [0.82, 0.7, 0.6, 0.5];
/** When the qualities are not enough, the side shrinks by this much, twice at most. */
const SHRINK = 0.8;

/**
 * Makes a photo smaller on the phone before the upload (for 2G and 3G links): JPEG at most
 * 1600 px on the longest side, aiming at the target size of docs/architecture/OFFLINE_SYNC.md
 * (photo queue and resumable upload) with lower qualities and then a smaller side; the smallest
 * result wins when none reaches it. Drawing on a canvas also drops the metadata; the API strips
 * it again in any case. Where the browser cannot decode images (tests, very old browsers) the
 * file goes as it is.
 */
export async function compressImage(file: File, target = PHOTO_TARGET_BYTES): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    let best: Blob = file;
    for (let shrink = 0; shrink <= 2; shrink += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) break;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', quality),
        );
        if (blob && blob.size < best.size) best = blob;
        if (blob && blob.size <= target) {
          bitmap.close();
          return blob;
        }
      }
      scale *= SHRINK;
    }
    bitmap.close();
    return best;
  } catch {
    return file;
  }
}
