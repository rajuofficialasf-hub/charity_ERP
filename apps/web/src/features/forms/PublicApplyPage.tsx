import { maxSizeOf, PUBLIC_PHOTO_LIMITS } from '@css/shared/files';
import { formatDate, isoDateInDhaka } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import { Skeleton, Stack, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { TopBar } from '../../components/TopBar';
import { ApiFailure } from '../../api/client';
import { compressImage } from '../../lib/compress';
import { LoadError } from '../../components/LoadError';
import { FormRenderer, type Submission } from './FormRenderer';
import { publicForm, submitPublic, uploadPublicPhoto } from './public-api';
import type { UploadAdapter } from './upload-adapter';
import './public.css';

// the public photo route takes JPEG and PNG (the phone sends JPEG after compressing), at the
// form photo kind's size
const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = maxSizeOf('form_photo', 'image/jpeg') ?? 0;

/** The messages of a refused application by the question they name. */
const namedOf = (error: ApiFailure): Record<string, string> =>
  Object.fromEntries(error.details.filter((d) => d.path).map((d) => [d.path!, d.message] as const));

/**
 * The public application page of a project (docs/ui/SCREENS.md, "Public application"): anyone
 * with the link fills the project's form on a phone without signing in, adds photos one at a
 * time, and learns only that the application was received. A link that takes no applications,
 * for whatever reason, shows one plain page. The answers wait in the open tab until they are sent.
 */
export function PublicApplyPage() {
  const { token = '' } = useParams();
  const t = useTranslations('forms.apply');
  const locale = useLocale() as Locale;
  const [sent, setSent] = useState(false);
  const [closed, setClosed] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const view = useQuery({
    queryKey: ['public-form', token],
    queryFn: () => publicForm(token),
    retry: false,
    staleTime: Infinity,
  });
  const upload: UploadAdapter = useMemo(
    () => ({
      accept: PHOTO_TYPES,
      maxSize: PHOTO_MAX_BYTES,
      maxFiles: PUBLIC_PHOTO_LIMITS.perSubmission,
      upload: async (file, fieldKey, clientUuid) =>
        uploadPublicPhoto(token, clientUuid, fieldKey, await compressImage(file)),
      reasonOf: (error) =>
        error instanceof ApiFailure && error.status === 429
          ? t('too_many')
          : error instanceof ApiFailure
            ? error.message
            : t('upload_failed'),
    }),
    [token, t],
  );

  const send = async ({ answers, clientUuid }: Submission) => {
    try {
      await submitPublic(token, {
        clientUuid,
        clientCreatedAt: new Date().toISOString(),
        answers,
      });
      setServerErrors({});
      setSent(true);
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 404) setClosed(true);
      if (error instanceof ApiFailure && error.status === 422 && error.details.length) {
        setServerErrors(namedOf(error));
        throw new Error(t('fix_named'), { cause: error });
      }
      if (error instanceof ApiFailure && error.status === 429)
        throw new Error(t('too_many'), { cause: error });
      throw new Error(error instanceof ApiFailure ? error.message : t('send_failed'), {
        cause: error,
      });
    }
  };

  // every state of the page has its own level-one heading
  const body = () => {
    if (view.isPending)
      return (
        <Stack gap={2}>
          <h1>{t('title')}</h1>
          <Skeleton shape="card" />
        </Stack>
      );
    if (closed || (view.error instanceof ApiFailure && view.error.status === 404))
      return (
        <Stack gap={2}>
          <h1>{t('closed_title')}</h1>
          <Text>{t('closed')}</Text>
        </Stack>
      );
    if (view.error || !view.data)
      return (
        <Stack gap={2}>
          <h1>{t('title')}</h1>
          <LoadError
            error={view.error}
            message={
              view.error instanceof ApiFailure && view.error.status === 429
                ? t('too_many')
                : t('load_failed')
            }
            onRetry={() => void view.refetch()}
          />
        </Stack>
      );
    if (sent)
      return (
        <Stack gap={2}>
          <h1>{t('received_title')}</h1>
          <Text>{t('received')}</Text>
        </Stack>
      );
    const { project, form } = view.data;
    const photos = form.sections.some((s) => s.fields.some((f) => f.type === 'photo'));
    return (
      <Stack gap={3}>
        <Stack gap={1}>
          <h1>{localized(project.name, locale)}</h1>
          {project.applyTo ? (
            <Text tone="muted">{t('closes', { date: formatDate(project.applyTo) })}</Text>
          ) : null}
          {photos ? (
            <Text tone="muted">
              {t('photo_rule', { count: String(PUBLIC_PHOTO_LIMITS.perSubmission) })}
            </Text>
          ) : null}
        </Stack>
        <FormRenderer
          definition={form}
          audience="public"
          today={isoDateInDhaka(new Date())}
          upload={upload}
          layout="auto"
          submitLabel={t('submit')}
          onSubmit={send}
          serverErrors={serverErrors}
        />
      </Stack>
    );
  };

  return (
    <>
      <DocumentTitle
        title={view.data && !closed ? localized(view.data.project.name, locale) : t('title')}
      />
      <TopBar />
      <main id="main" className="public-apply">
        {body()}
      </main>
    </>
  );
}
