import { uuidv7 } from '@css/shared';
import { COVER_UPLOAD_SLOT, maxSizeOf } from '@css/shared/files';
import { FileUpload } from '@/ui';
import { useEffect, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { compressImage } from '../../lib/compress';
import { uploadFile, waitForScan } from '../../lib/uploads';
import { CardCover } from './CardCover';
import { setProgramCover, setSeriesCover } from './cards-api';

/** The photo types a cover takes, as the file service checks them. */
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const COVER_MAX = maxSizeOf('cover_photo', 'image/jpeg') ?? 0;

/** The records a cover belongs to. */
export type CoverRecord = 'program' | 'project_series';

/**
 * Makes a chosen photo the cover of a program or a project series
 * (docs/architecture/FILES_AND_DOCUMENTS.md, "Cover photos"): the photo is made smaller on the
 * device, uploaded in parts under the record's cover upload slot, and then set as its cover, which
 * keeps the earlier cover's file. Runs after the record's own save, so a new record has its id.
 */
export async function saveCover(record: CoverRecord, id: string, file: File): Promise<void> {
  const blob = await compressImage(file);
  const stored = await uploadFile(
    blob,
    {
      kind: 'cover_photo',
      entityType: record,
      entityId: id,
      slot: COVER_UPLOAD_SLOT,
      source: 'gallery',
    },
    { clientUuid: uuidv7() },
  );
  // the server sets only a cover its scan has cleared, which runs a moment after the upload
  await waitForScan(stored);
  await (record === 'program' ? setProgramCover(id, stored.id) : setSeriesCover(id, stored.id));
}

/**
 * The cover photo of a program's or a project's dialog: the cover it has now (or its drawing),
 * and one photo to put in its place, held on the device until the dialog saves (`saveCover`).
 */
export function CoverField({
  current,
  seed,
  value,
  onChange,
}: {
  /** The cover the record has now, if any. */
  current: string | null;
  /** The record's id, which seeds its drawing; a new record has none yet. */
  seed?: string;
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const t = useTranslations('admin.projects.cover');
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : undefined), [value]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);
  return (
    <div className="cover-field">
      {!value && seed && (
        <figure className="cover-field-current">
          <div className="cover-field-picture">
            <CardCover fileId={current} seed={seed} />
          </div>
          <figcaption>{t('current')}</figcaption>
        </figure>
      )}
      <FileUpload
        label={t('label')}
        hint={t('hint')}
        source="gallery"
        accept={COVER_TYPES}
        maxSize={COVER_MAX}
        maxSizeText={t('max_size')}
        value={
          value
            ? [
                {
                  id: 'cover',
                  name: value.name,
                  state: 'ready',
                  previewUrl: preview,
                  removable: true,
                },
              ]
            : []
        }
        onAdd={(files) => onChange(files[0] ?? null)}
        onRemove={() => onChange(null)}
      />
    </div>
  );
}
