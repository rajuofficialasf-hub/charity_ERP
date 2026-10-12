/** Longest side of a photo after compression; enough for a face and an NID card. */
const MAX_SIDE = 1600;
const QUALITY = 0.82;

/**
 * Makes a photo smaller on the phone before the upload (NFR-12: 2G and 3G links): JPEG at most
 * 1600 px on the longest side. Drawing on a canvas also drops the metadata; the API strips it
 * again in any case. Where the browser cannot decode images (tests, very old browsers) the file
 * goes as it is.
 */
export async function compressImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
