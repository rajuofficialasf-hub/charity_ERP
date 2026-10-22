import { FileUpload, Stack, Text, type UploadItem } from '@css/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import type { UploadAdapter } from './upload-adapter';

/**
 * A photo, file or signature question: each file goes up through the screen's adapter as it is
 * chosen, and the answer holds the ids the server gave back. A signature is a photo of a signature
 * on paper. Without an adapter the question shows that it takes nothing here.
 */
export function UploadField({
  type,
  fieldKey,
  label,
  helper,
  error,
  required,
  fileIds,
  adapter,
  onChange,
}: {
  type: 'photo' | 'file' | 'signature';
  fieldKey: string;
  label: string;
  helper?: string;
  error?: string;
  required: boolean;
  fileIds: string[];
  adapter?: UploadAdapter;
  onChange: (fileIds: string[]) => void;
}) {
  const t = useTranslations('forms.renderer');
  const [items, setItems] = useState<UploadItem[]>(() =>
    fileIds.map((id, i) => ({ id, name: `${label} ${i + 1}`, state: 'ready', removable: true })),
  );
  if (!adapter)
    return (
      <Stack gap={1}>
        <Text weight="bold">{label}</Text>
        <Text tone="muted">{t('upload_inert')}</Text>
      </Stack>
    );
  const done = (list: UploadItem[]) => list.filter((i) => i.state === 'ready').map((i) => i.id);
  const add = (files: File[]) => {
    for (const file of files) {
      const temp = `local-${crypto.randomUUID()}`;
      setItems((list) => [
        ...list,
        { id: temp, name: file.name, state: 'uploading', removable: false },
      ]);
      adapter.upload(file, fieldKey).then(
        ({ fileId }) =>
          setItems((list) => {
            const next = list.map((i) =>
              i.id === temp ? { ...i, id: fileId, state: 'ready' as const, removable: true } : i,
            );
            onChange(done(next));
            return next;
          }),
        (reason: unknown) =>
          setItems((list) =>
            list.map((i) =>
              i.id === temp
                ? {
                    ...i,
                    state: 'failed' as const,
                    reason: adapter.reasonOf?.(reason),
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
      helper={helper}
      error={error}
      required={required}
      source={type === 'file' ? 'file' : 'camera_or_gallery'}
      accept={adapter.accept}
      maxSize={adapter.maxSize}
      multiple={(adapter.maxFiles ?? 1) > 1}
      maxFiles={adapter.maxFiles}
      value={items}
      onAdd={add}
      onRemove={(id) =>
        setItems((list) => {
          const next = list.filter((i) => i.id !== id);
          onChange(done(next));
          return next;
        })
      }
    />
  );
}
