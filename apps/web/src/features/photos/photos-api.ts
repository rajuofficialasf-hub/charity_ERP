import { api, type SavedFile } from '../../api/client';
import type { FileDetails } from '../../api/schemas';
import { saveFile } from '../../lib/save-file';

/** The query key of a file's details. */
export const detailsKey = (fileId: string) => ['files', fileId, 'details'] as const;

/** A file's details: when and where it was taken, its size, who uploaded it, its records. */
export function photoDetails(fileId: string): Promise<FileDetails> {
  return api<FileDetails>(`/files/${fileId}`);
}

/**
 * Saves a photo with its time and place written into it (docs/architecture/FILES_AND_DOCUMENTS.md,
 * "Download of a photo"): the API checks, audits and names it.
 */
export async function downloadPhoto(fileId: string): Promise<void> {
  const saved = await api<SavedFile>(`/files/${fileId}/download`, { file: true });
  // the server names the photo; without its name, the photo's own type gives the extension
  const extension = saved.blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  saveFile(saved.blob, saved.fileName ?? `photo-${fileId.slice(0, 8)}.${extension}`);
}

/**
 * The app's own address of a photo: it opens the viewer for a signed-in person the API lets see
 * the photo, and works for no one else.
 */
export function photoLink(fileId: string): string {
  return new URL(`/photos/${fileId}`, window.location.origin).href;
}
