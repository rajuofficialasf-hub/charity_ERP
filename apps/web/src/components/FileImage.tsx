import { Skeleton } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { api } from '../lib/api';
import './file-image.css';

/** The photo types the API stores (registration photos, D-087); anything else is not shown. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

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
  const file = useQuery({
    queryKey: ['files', fileId],
    queryFn: async () => dataUrl(await api<Blob>(`/files/${fileId}/content`, { blob: true })),
    // a photo leaves the cache with its screen: opening it again asks the API (and audits an
    // NID photo view) again
    gcTime: 0,
  });
  if (file.error) return <p className="file-image-error">{t('state.error.text')}</p>;
  if (!file.data) return <Skeleton shape="card" />;
  return <img src={file.data} alt={alt} className="file-image" />;
}
