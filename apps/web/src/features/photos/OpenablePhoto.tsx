import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { FileImage } from '../../components/FileImage';
import { type PhotoRef, PhotoViewerDialog } from './PhotoViewerDialog';
import './photos.css';

/**
 * A photo of a record that opens large in the viewer, among the other photos of its group (the
 * documents of a person, the photos of one answer), at its own place in the group. Shows the
 * streamed photo unless the page draws its own picture as `children`.
 */
export function OpenablePhoto({
  photos,
  index,
  title,
  children,
}: {
  photos: readonly PhotoRef[];
  index: number;
  title?: string;
  children?: ReactNode;
}) {
  const t = useTranslations('photos');
  const [open, setOpen] = useState(false);
  const photo = photos[index];
  if (!photo) return null;
  return (
    <>
      <button
        type="button"
        className="openable-photo"
        aria-label={t('open', { name: photo.alt })}
        onClick={() => setOpen(true)}
      >
        {children ?? <FileImage fileId={photo.fileId} alt="" />}
      </button>
      <PhotoViewerDialog
        open={open}
        onClose={() => setOpen(false)}
        photos={photos}
        start={index}
        {...(title ? { title } : {})}
      />
    </>
  );
}
