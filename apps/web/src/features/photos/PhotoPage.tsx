import type { Me } from '@css/shared/auth';
import { Button, LinkButton, Skeleton, Stack, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { detailsKey, photoDetails } from './photos-api';
import { PhotoViewerDialog } from './PhotoViewerDialog';

/** The page of a record type the app has, for the link from a photo to its record. */
function recordPath(entityType: string, entityId: string, volunteer: boolean): string | null {
  if (entityType === 'application')
    return volunteer ? `/my-applications/${entityId}` : `/admin/applications/${entityId}`;
  return null;
}

/**
 * The app's own address of a photo (`/photos/:fileId`, docs/architecture/FILES_AND_DOCUMENTS.md,
 * "Download of a photo"): only for a signed-in person, the viewer opens on the photo when the API
 * lets them see it, the page behind it leads to the photo's record, and anyone else is told the
 * photo was not found, as the API answers.
 */
export function PhotoPage() {
  const t = useTranslations('photos');
  return (
    <AccountPage title={() => t('title')}>
      {(me) => (
        <>
          <DocumentTitle title={t('title')} />
          <PhotoPageBody me={me} />
        </>
      )}
    </AccountPage>
  );
}

function PhotoPageBody({ me }: { me: Me }) {
  const t = useTranslations('photos');
  const { fileId = '' } = useParams();
  const [open, setOpen] = useState(true);
  const details = useQuery({
    queryKey: detailsKey(fileId),
    queryFn: () => photoDetails(fileId),
    gcTime: 0,
  });

  if (details.isPending) return <Skeleton shape="card" />;
  if (details.isError) {
    const missing = details.error instanceof ApiFailure && details.error.status === 404;
    return (
      <Text tone={missing ? 'default' : 'error'}>{missing ? t('notFound') : t('loadFailed')}</Text>
    );
  }
  const record = details.data.records
    .map((r) => recordPath(r.entityType, r.entityId, me.kind === 'volunteer'))
    .find((path) => path !== null);
  return (
    <>
      <Stack gap={2}>
        <div>
          <Button variant="secondary" startIcon="gallery" onClick={() => setOpen(true)}>
            {t('show')}
          </Button>
        </div>
        {record && (
          <div>
            <LinkButton to={record} variant="text">
              {t('openRecord')}
            </LinkButton>
          </div>
        )}
      </Stack>
      <PhotoViewerDialog
        open={open}
        onClose={() => setOpen(false)}
        photos={[{ fileId, alt: t('title') }]}
      />
    </>
  );
}
