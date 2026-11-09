import { Skeleton } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { api, ApiFailure } from '../api/client';
import './file-image.css';

/** The photo types the API stores and the thumbnails it makes; anything else is not shown. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The answers of a photo the scan has not cleared yet, and of one it blocked. */
const QUARANTINED = 423;
const BLOCKED = 410;

/** Reads a photo as a data URL: nothing to revoke, and the cache drops it with the query. */
const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    if (!IMAGE_TYPES.has(blob.type)) {
      reject(new Error('not a photo'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read'));
    reader.readAsDataURL(blob);
  });

/**
 * A private photo streamed by the API (GET /files/{fileId}/content with the access token; no
 * signed URL, DECISION_LOG D-074). The API decides per file who may see it and audits a view of an
 * NID photo; the page keeps the image only in its query cache.
 */
export function FileImage({ fileId, alt }: { fileId: string; alt: string }) {
  const t = useTranslations('common');
  const errors = useTranslations('errors');
  const file = useFileDataUrl(fileId);
  if (file.error) {
    // a photo the scan has not cleared yet, or one it blocked, says so instead of a failure
    const status = file.error instanceof ApiFailure ? file.error.status : 0;
    const text =
      status === QUARANTINED
        ? errors('file.quarantined')
        : status === BLOCKED
          ? errors('file.infected')
          : t('state.error.text');
    return <p className="file-image-error">{text}</p>;
  }
  if (!file.data) return <Skeleton shape="card" />;
  return <img src={file.data} alt={alt} className="file-image" />;
}

/** The photo as a data URL for a place that draws it itself (the avatar); idle without a file. */
export function useFileDataUrl(fileId: string | null) {
  return useQuery({
    queryKey: ['files', fileId],
    queryFn: async () => dataUrl(await api<Blob>(`/files/${fileId}/content`, { blob: true })),
    enabled: fileId !== null,
    // a photo leaves the cache with its screen: opening it again asks the API (and audits an
    // NID photo view) again
    gcTime: 0,
  });
}
