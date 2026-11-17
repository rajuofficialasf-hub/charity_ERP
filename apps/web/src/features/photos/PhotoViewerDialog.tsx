import { CopyButton, IconButton, PhotoViewer, useToast, type ViewerPhoto } from '@/ui';
import { useMutation, useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { fileDataUrlKey, readFileDataUrl, useFileDataUrl } from '../../components/FileImage';
import { downloadPhoto, photoLink } from './photos-api';
import { PhotoDetails } from './PhotoDetails';

/** A photo a page opens: its file and what it shows. */
export interface PhotoRef {
  fileId: string;
  alt: string;
}

/** The answers of a photo the scan has not cleared yet, and of one it blocked. */
const QUARANTINED = 423;
const BLOCKED = 410;

/**
 * The record's photos seen large (the asf `PhotoViewer`, docs/ui/DESIGN_SYSTEM.md, "Photo viewer"):
 * the photo itself streamed by the API, the strip from the small thumbnails, the details the
 * server keeps, a download with the time and place written in, and the app's own link of the
 * photo to copy. Opened at `start` each time it opens.
 */
export function PhotoViewerDialog(props: {
  open: boolean;
  onClose: () => void;
  photos: readonly PhotoRef[];
  start?: number;
  title?: string;
}) {
  // a closed viewer holds nothing: each opening starts again at its photo
  if (!props.open) return null;
  return <OpenViewer {...props} />;
}

function OpenViewer({
  onClose,
  photos,
  start = 0,
  title,
}: {
  onClose: () => void;
  photos: readonly PhotoRef[];
  start?: number;
  title?: string;
}) {
  const t = useTranslations('photos');
  const errors = useTranslations('errors');
  const common = useTranslations('common');
  const toast = useToast();
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(photos.length - 1, 0)));
  const current = photos[index];
  const shown = useFileDataUrl(current?.fileId ?? null);
  const thumbs = useQueries({
    queries: photos.map((photo) => ({
      queryKey: fileDataUrlKey(photo.fileId, 'small'),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        readFileDataUrl(photo.fileId, 'small', signal),
      // one photo needs no strip
      enabled: photos.length > 1,
      gcTime: 0,
    })),
  });
  const download = useMutation({
    mutationFn: (fileId: string) => downloadPhoto(fileId),
    onError: () => toast.error(t('downloadFailed')),
  });

  const unavailable = (error: unknown) => {
    const status = error instanceof ApiFailure ? error.status : 0;
    if (status === QUARANTINED) return errors('file.quarantined');
    if (status === BLOCKED) return errors('file.infected');
    return common('state.error.text');
  };

  const viewerPhotos: ViewerPhoto[] = photos.map((photo, i) => ({
    id: photo.fileId,
    alt: photo.alt,
    ...(i === index && shown.data ? { src: shown.data } : {}),
    ...(i === index && shown.error ? { message: unavailable(shown.error) } : {}),
    ...(thumbs[i]?.data ? { thumbSrc: thumbs[i].data } : {}),
  }));

  return (
    <PhotoViewer
      open
      onClose={onClose}
      photos={viewerPhotos}
      index={index}
      onIndexChange={setIndex}
      {...(title ? { title } : {})}
      details={current ? <PhotoDetails fileId={current.fileId} /> : null}
      actions={
        current && (
          <>
            <IconButton
              label={t('download')}
              icon="download"
              disabled={download.isPending || !shown.data}
              onClick={() => download.mutate(current.fileId)}
            />
            <CopyButton value={photoLink(current.fileId)} label={t('link')} />
          </>
        )
      }
    />
  );
}
