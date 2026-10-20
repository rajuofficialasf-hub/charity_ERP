import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { uuidv7 } from '@css/shared';
import { maxSizeOf } from '@css/shared/files';
import type { UploadItem } from '@css/ui';
import { ApiFailure } from './api';
import { compressImage } from './compress';
import { readPhotoMeta } from './photo-meta';
import { type UploadedFile, uploadFile, type UploadOptions, type UploadTarget } from './uploads';

/** Where the files go and what to do with each stored one. */
export interface FileUploadTarget extends Omit<UploadTarget, 'capturedAt' | 'gps'> {
  /** Each file once the server has stored it (still quarantined until the scan clears it). */
  onUploaded?: (file: UploadedFile) => void;
  /** A pause, replaced in tests. */
  sleep?: UploadOptions['sleep'];
}

interface Entry {
  file: File;
  clientUuid: string;
}

/**
 * The upload of one field (docs/ui/DESIGN_SYSTEM.md, the file upload): for each file, the photo's
 * capture time and position are read, the photo is compressed, its type and size are checked, the
 * parts go to the API with progress, and the item ends ready, quarantined (stored, waiting for the
 * scan), rejected (the server refused it, with its reason) or failed (the network; retry resumes
 * from the parts the server holds). The items drive the `FileUpload` component.
 */
export function useFileUpload(target: FileUploadTarget) {
  const t = useTranslations('errors');
  const [items, setItems] = useState<UploadItem[]>([]);
  const entries = useRef(new Map<string, Entry>());
  const live = useRef(target);
  useEffect(() => {
    live.current = target;
  });
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  // the previews are object URLs: let them go with the field
  useEffect(
    () => () => {
      for (const item of itemsRef.current)
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const run = useCallback(
    async (id: string) => {
      const entry = entries.current.get(id);
      if (!entry) return;
      const { onUploaded, sleep, ...where } = live.current;
      const isImage = entry.file.type.startsWith('image/');
      patch(id, { state: isImage ? 'compressing' : 'queued', reason: undefined });
      // the metadata goes when the photo is drawn smaller, so it is read first
      const meta = isImage ? await readPhotoMeta(entry.file) : {};
      const blob = isImage ? await compressImage(entry.file) : entry.file;
      const limit = maxSizeOf(where.kind, blob.type);
      if (limit === null || blob.size > limit) {
        patch(id, {
          state: 'rejected',
          reason: t(limit === null ? 'file.type_not_allowed' : 'file.too_large'),
          removable: true,
        });
        return;
      }
      patch(id, { state: 'uploading', progress: 0 });
      try {
        const stored = await uploadFile(
          blob,
          { ...where, ...meta },
          {
            clientUuid: entry.clientUuid,
            onProgress: (progress) => patch(id, { progress }),
            ...(sleep ? { sleep } : {}),
          },
        );
        const cleared = stored.virusScan === 'clean' || stored.virusScan === 'skipped';
        patch(id, {
          state: cleared ? 'ready' : 'quarantined',
          progress: 100,
          reason: cleared ? undefined : t('file.quarantined'),
          removable: false,
        });
        onUploaded?.(stored);
      } catch (error) {
        // the server refused the file: show its reason; anything else may be tried again
        const refused =
          error instanceof ApiFailure &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429;
        patch(id, {
          state: refused ? 'rejected' : 'failed',
          reason: refused ? error.message : t('server.unavailable'),
          removable: true,
        });
      }
    },
    [patch, t],
  );

  const add = useCallback(
    (files: File[]) => {
      const added = files.map((file) => {
        const id = uuidv7();
        entries.current.set(id, { file, clientUuid: uuidv7() });
        return {
          id,
          name: file.name,
          state: 'selected' as const,
          ...(file.type.startsWith('image/') ? { previewUrl: URL.createObjectURL(file) } : {}),
        };
      });
      setItems((list) => [...list, ...added]);
      for (const item of added) void run(item.id);
    },
    [run],
  );

  /** Sends a failed file again; the same client id resumes the server's session. */
  const retry = useCallback((id: string) => void run(id), [run]);

  /** Takes a file off the field; one already stored stays on the server. */
  const remove = useCallback((id: string) => {
    entries.current.delete(id);
    setItems((list) => {
      const gone = list.find((item) => item.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return list.filter((item) => item.id !== id);
    });
  }, []);

  return { items, add, retry, remove };
}
