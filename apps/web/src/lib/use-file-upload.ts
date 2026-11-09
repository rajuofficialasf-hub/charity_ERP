import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { uuidv7 } from '@css/shared';
import { maxSizeOf } from '@css/shared/files';
import type { UploadItem } from '@/ui';
import { ApiFailure } from './api';
import { compressImage } from './compress';
import { readPhotoMeta } from './photo-meta';
import {
  type UploadedFile,
  uploadFile,
  type UploadOptions,
  UploadStopped,
  type UploadTarget,
} from './uploads';

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
  /** The compressed photo and its metadata, made once: a retry sends the same bytes. */
  prepared?: { blob: Blob; meta: Awaited<ReturnType<typeof readPhotoMeta>> };
  /** Stops the upload when the file is taken off the field. */
  stop: AbortController;
}

/** Files sent at the same time; the rest wait their turn (a phone's link and the open sessions). */
const PARALLEL_UPLOADS = 3;

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
      // uploads still on their way stop with the field
      for (const entry of entries.current.values()) entry.stop.abort();
    },
    [],
  );

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const running = useRef(0);
  const waiting = useRef<string[]>([]);

  const upload = useCallback(
    async (id: string) => {
      const entry = entries.current.get(id);
      if (!entry) return;
      const { onUploaded, sleep, ...where } = live.current;
      const isImage = entry.file.type.startsWith('image/');
      patch(id, { state: isImage ? 'compressing' : 'queued', reason: undefined });
      // the metadata goes when the photo is drawn smaller, so it is read first
      entry.prepared ??= isImage
        ? { meta: await readPhotoMeta(entry.file), blob: await compressImage(entry.file) }
        : { meta: {}, blob: entry.file };
      const { blob, meta } = entry.prepared;
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
      let stored;
      try {
        stored = await uploadFile(
          blob,
          { ...where, ...meta },
          {
            clientUuid: entry.clientUuid,
            onProgress: (progress) => patch(id, { progress }),
            signal: entry.stop.signal,
            ...(sleep ? { sleep } : {}),
          },
        );
      } catch (error) {
        if (error instanceof UploadStopped) return;
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
        return;
      }
      const cleared = stored.virusScan === 'clean' || stored.virusScan === 'skipped';
      patch(id, {
        state: cleared ? 'ready' : 'quarantined',
        progress: 100,
        reason: cleared ? undefined : t('file.quarantined'),
        removable: false,
      });
      // the caller's own handling of the stored file never turns it into a failed one
      try {
        onUploaded?.(stored);
      } catch {
        // nothing to undo: the file is stored
      }
    },
    [patch, t],
  );

  /** Starts the next waiting files while fewer than three are on their way. */
  const next = useRef<() => void>(() => undefined);
  const pump = useCallback(() => {
    while (running.current < PARALLEL_UPLOADS && waiting.current.length) {
      const id = waiting.current.shift()!;
      running.current += 1;
      void upload(id).finally(() => {
        running.current -= 1;
        next.current();
      });
    }
  }, [upload]);
  useEffect(() => {
    next.current = pump;
  }, [pump]);

  const run = useCallback(
    (id: string) => {
      if (!entries.current.has(id) || waiting.current.includes(id)) return;
      waiting.current.push(id);
      patch(id, { state: 'queued', reason: undefined });
      pump();
    },
    [patch, pump],
  );

  const add = useCallback(
    (files: File[]) => {
      const added = files.map((file) => {
        const id = uuidv7();
        entries.current.set(id, { file, clientUuid: uuidv7(), stop: new AbortController() });
        return {
          id,
          name: file.name,
          state: 'selected' as const,
          ...(file.type.startsWith('image/') ? { previewUrl: URL.createObjectURL(file) } : {}),
        };
      });
      setItems((list) => [...list, ...added]);
      for (const item of added) run(item.id);
    },
    [run],
  );

  /** Sends a failed file again; the same client id resumes the server's session. */
  const retry = useCallback((id: string) => run(id), [run]);

  /** Takes a file off the field; one already stored stays on the server. */
  const remove = useCallback((id: string) => {
    entries.current.get(id)?.stop.abort();
    entries.current.delete(id);
    waiting.current = waiting.current.filter((w) => w !== id);
    setItems((list) => {
      const gone = list.find((item) => item.id === id);
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
      return list.filter((item) => item.id !== id);
    });
  }, []);

  return { items, add, retry, remove };
}
