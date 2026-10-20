import { PHOTO_MAX_BYTES } from '@css/shared/registration';
import { FileUpload, type UploadItem } from '@css/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { compressImage } from '../../lib/compress';

const ACCEPT = ['image/jpeg', 'image/png'];

/**
 * One photo (the photo or the NID photo): taken with the camera or chosen from the gallery,
 * compressed on the phone and uploaded at once; `onUploaded` receives the file id, or null when
 * the photo is removed to take another (the next upload replaces it on the server).
 */
export function PhotoField({
  label,
  upload,
  onUploaded,
  error,
}: {
  label: string;
  upload: (photo: Blob, source: 'camera' | 'gallery') => Promise<{ fileId: string }>;
  onUploaded: (fileId: string | null) => void;
  error?: string;
}) {
  const t = useTranslations('registration.form');
  const [item, setItem] = useState<UploadItem | null>(null);
  // only the latest pick may change the field (an older upload can finish later)
  const latest = useRef(0);

  useEffect(
    () => () => {
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [item?.previewUrl],
  );

  const add = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const pick = ++latest.current;
    const current = () => pick === latest.current;
    const previewUrl = URL.createObjectURL(file);
    const base = { id: file.name, name: file.name, previewUrl };
    setItem({ ...base, state: 'compressing' });
    try {
      const photo = await compressImage(file);
      if (!current()) return;
      setItem({ ...base, state: 'uploading' });
      // the browser does not tell which button picked the file, so the source stays "gallery"
      const { fileId } = await upload(photo, 'gallery');
      if (!current()) return;
      setItem({ ...base, state: 'ready', removable: true });
      onUploaded(fileId);
    } catch (failure) {
      if (!current()) return;
      setItem({
        ...base,
        state: 'failed',
        removable: true,
        reason: failure instanceof ApiFailure ? failure.message : undefined,
      });
    }
  };

  return (
    <FileUpload
      label={label}
      helper={t('photo_helper')}
      required
      source="camera_or_gallery"
      accept={ACCEPT}
      maxSize={PHOTO_MAX_BYTES * 4}
      maxSizeText={t('photo_max')}
      value={item ? [item] : []}
      onAdd={(files) => void add(files)}
      onRemove={() => {
        setItem(null);
        onUploaded(null);
      }}
      error={error}
    />
  );
}
