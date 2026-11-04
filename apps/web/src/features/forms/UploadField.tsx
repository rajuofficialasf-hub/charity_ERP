import { FileUpload, Stack, Text, type UploadItem } from '@/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { FieldUpload } from './upload-adapter';

const MB = 1024 * 1024;

function revokePreview(item: UploadItem): void {
  if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
}

/**
 * A photo, file or signature question: each file goes up through the screen's adapter as it is
 * chosen, and the answer holds the ids the server gave back. A signature is a photo of a signature
 * on paper. Without an adapter the question shows that it takes nothing here.
 */
export function UploadField({
  type,
  fieldKey,
  label,
  hint,
  error,
  required,
  fileIds,
  adapter,
  onChange,
  onUploading,
}: {
  type: 'photo' | 'file' | 'signature';
  fieldKey: string;
  label: string;
  hint?: string;
  error?: string;
  required: boolean;
  fileIds: string[];
  adapter?: FieldUpload;
  onChange: (fileIds: string[]) => void;
  onUploading?: (busy: boolean) => void;
}) {
  const t = useTranslations('forms.renderer');
  const [items, setItems] = useState<UploadItem[]>(() =>
    fileIds.map((id, i) => ({ id, name: `${label} ${i + 1}`, state: 'ready', removable: true })),
  );
  const current = useRef(items);
  // a preview of a photo kept on the phone is an object URL: it goes with the field
  useEffect(
    () => () => {
      for (const item of current.current) revokePreview(item);
    },
    [],
  );
  if (!adapter)
    return (
      <Stack gap={1}>
        <Text>
          <strong>{label}</strong>
        </Text>
        <Text tone="muted">{t('upload_inert')}</Text>
      </Stack>
    );
  const done = (list: UploadItem[]) => list.filter((i) => i.state === 'ready').map((i) => i.id);
  // the list changes through this one function, so the answer and the busy flag follow it
  // without side effects inside a state update
  const update = (change: (list: UploadItem[]) => UploadItem[]) => {
    const next = change(current.current);
    current.current = next;
    setItems(next);
    onChange(done(next));
    onUploading?.(next.some((i) => i.state === 'uploading'));
  };
  const add = (files: File[]) => {
    for (const file of files) {
      const temp = `local-${crypto.randomUUID()}`;
      update((list) => [
        ...list,
        { id: temp, name: file.name, state: 'uploading', removable: false },
      ]);
      adapter.upload(file, fieldKey).then(
        ({ fileId, previewUrl }) =>
          update((list) =>
            list.map((i) =>
              i.id === temp
                ? {
                    ...i,
                    id: fileId,
                    state: 'ready' as const,
                    removable: true,
                    ...(previewUrl ? { previewUrl } : {}),
                  }
                : i,
            ),
          ),
        (reason: unknown) =>
          update((list) =>
            list.map((i) =>
              i.id === temp
                ? {
                    ...i,
                    state: 'failed' as const,
                    reason: adapter.reasonOf?.(reason) ?? t('upload_failed'),
                    removable: true,
                  }
                : i,
            ),
          ),
      );
    }
  };
  return (
    <FileUpload
      label={label}
      hint={hint}
      error={error}
      required={required}
      source={type === 'file' ? 'file' : 'camera_or_gallery'}
      accept={adapter.accept}
      maxSize={adapter.maxSize}
      multiple={(adapter.maxFiles ?? 1) > 1}
      maxFiles={adapter.maxFiles}
      maxSizeText={`${Math.round(adapter.maxSize / MB)} MB`}
      value={items}
      onAdd={add}
      // a file refused before it is sent stays in the list with the reason, until removed
      onReject={(file, reason) =>
        update((list) => [
          ...list,
          {
            id: `rejected-${crypto.randomUUID()}`,
            name: file.name,
            state: 'rejected',
            reason,
            removable: true,
          },
        ])
      }
      onRemove={(id) =>
        update((list) => {
          const gone = list.find((i) => i.id === id);
          if (gone) revokePreview(gone);
          return list.filter((i) => i.id !== id);
        })
      }
    />
  );
}
