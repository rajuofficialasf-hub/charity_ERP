import type { Me } from '@css/shared/auth';
import { maxSizeOf } from '@css/shared/files';
import type { Answer } from '@css/shared/forms';
import { formatCount, formatDate, isoDateInDhaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, ErrorState, Skeleton, Stack, Text } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { LookupResult } from '../../admin/beneficiaries/beneficiaries-api';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { compressImage } from '../../lib/compress';
import { uploadFile } from '../../lib/uploads';
import { LookupField } from '../beneficiaries/LookupField';
import { FormRenderer, type Submission } from '../forms/FormRenderer';
import type { UploadAdapter } from '../forms/upload-adapter';
import { MY_PROJECTS_KEY, myProject } from '../projects/my-projects-api';
import {
  actOn,
  type Application,
  application,
  applicationForm,
  applicationKey,
  createApplication,
  MY_APPLICATIONS_KEY,
  updateApplication,
} from './applications-api';
import { answersOfNumber, answersOfProfile, lockedKeysOf } from './identity-answers';
import './applications.css';

const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = maxSizeOf('form_photo', 'image/jpeg') ?? 0;
const TEAM_MEMBER = 'volunteer_team_member';

/** The messages of a refused save by the question they name. */
const namedOf = (error: ApiFailure): Record<string, string> =>
  Object.fromEntries(error.details.filter((d) => d.path).map((d) => [d.path!, d.message] as const));

/** The person the identity step settled on. */
type Person =
  { kind: 'known'; number: string; result: LookupResult } | { kind: 'new'; number: string };

/**
 * A new application on a phone (docs/ui/SCREENS.md, SCR-031): the person first, by NID or birth
 * registration; a known person's identity fills in and locks; then the project's form part by
 * part, the draft saved as each part is done (so photos can join it), and "অফিসে পাঠান" at the
 * end, which answers with the number. A team member keeps the draft for the main volunteer.
 */
export function ApplicationFormPage() {
  const t = useTranslations('applications.new');
  const { applicationId } = useParams();
  return (
    <AccountPage title={() => (applicationId ? t('edit_title') : t('title'))}>
      {(me) =>
        applicationId ? (
          <EditDraft me={me} applicationId={applicationId} />
        ) : (
          <NewApplication me={me} />
        )
      }
    </AccountPage>
  );
}

function NewApplication({ me }: { me: Me }) {
  const { projectId = '' } = useParams();
  const t = useTranslations('applications.new');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const project = useQuery({
    queryKey: [...MY_PROJECTS_KEY, projectId],
    queryFn: () => myProject(projectId),
  });
  const form = useQuery({
    queryKey: ['projects', projectId, 'application-form'],
    queryFn: () => applicationForm(projectId),
    retry: false,
  });
  const [person, setPerson] = useState<Person | null>(null);
  const [lookup, setLookup] = useState<{ result: LookupResult; number: string } | null>(null);
  const back = <Link to={`/my-projects/${projectId}`}>{tc('action.close')}</Link>;
  if (project.isPending || form.isPending) return <Skeleton shape="card" />;
  if (form.error instanceof ApiFailure && form.error.status === 422)
    return (
      <Stack gap={2}>
        {back}
        <Alert tone="warning">{t('no_form')}</Alert>
      </Stack>
    );
  if (project.error || form.error || !project.data || !form.data)
    return (
      <Stack gap={2}>
        {back}
        <ErrorState title={t('load_failed')} onRetry={() => void form.refetch()} />
      </Stack>
    );
  const p = project.data;
  const definition = form.data;
  if (!person)
    return (
      <Stack gap={3}>
        <DocumentTitle title={t('title')} />
        {back}
        <Card title={localized(p.name, locale)} headingLevel={2}>
          <Stack gap={2}>
            {p.applyTo ? (
              <Text tone="muted">{t('closes', { date: formatDate(p.applyTo) })}</Text>
            ) : null}
            {p.perVolunteerLimit !== null ? (
              <Text tone="muted">
                {t('limit', {
                  counted: formatCount(p.applicationsCounted, locale),
                  limit: formatCount(p.perVolunteerLimit, locale),
                })}
              </Text>
            ) : null}
            {me.roles.includes(TEAM_MEMBER) ? <Alert tone="info">{t('team_note')}</Alert> : null}
          </Stack>
        </Card>
        <Card title={t('identity_title')} headingLevel={2}>
          <Stack gap={3}>
            <Text tone="muted">{t('identity_help')}</Text>
            <LookupField
              projectId={projectId}
              onResult={(result, _mobile, number) =>
                setLookup(result && number ? { result, number } : null)
              }
            />
            {lookup && lookup.result.found && lookup.result.blocked ? (
              <Alert tone="danger">{t('blocked')}</Alert>
            ) : lookup && lookup.result.found && lookup.result.alreadyAppliedInProject ? (
              <Alert tone="warning">{t('already_applied')}</Alert>
            ) : lookup ? (
              <Button
                variant="primary"
                onPress={() =>
                  setPerson(
                    lookup.result.found
                      ? { kind: 'known', number: lookup.number, result: lookup.result }
                      : { kind: 'new', number: lookup.number },
                  )
                }
              >
                {lookup.result.found ? t('start_known') : t('start_new')}
              </Button>
            ) : null}
          </Stack>
        </Card>
      </Stack>
    );
  const initial =
    person.kind === 'known' && person.result.autofill
      ? answersOfProfile(definition, person.number, person.result.autofill)
      : answersOfNumber(definition, person.number);
  return (
    <Stack gap={3}>
      <DocumentTitle title={t('title')} />
      {back}
      <ApplicationForm
        me={me}
        projectId={projectId}
        form={definition}
        initialAnswers={initial}
        lockedKeys={person.kind === 'known' ? lockedKeysOf(definition) : new Set()}
        storageKey={`apply:${projectId}:${definition.id}:${person.number}`}
      />
    </Stack>
  );
}

function EditDraft({ me, applicationId }: { me: Me; applicationId: string }) {
  const t = useTranslations('applications.detail');
  const one = useQuery({
    queryKey: applicationKey(applicationId),
    queryFn: () => application(applicationId),
  });
  const back = <Link to={`/my-applications/${applicationId}`}>{t('back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        {back}
        <ErrorState title={t('load_failed')} onRetry={() => void one.refetch()} />
      </Stack>
    );
  const record = one.data.data;
  return (
    <Stack gap={3}>
      {back}
      <ApplicationForm
        me={me}
        projectId={record.projectId}
        form={record.form}
        initialAnswers={record.answers}
        lockedKeys={record.beneficiaryId ? lockedKeysOf(record.form) : new Set()}
        storageKey={`apply:${record.projectId}:${record.form.id}:${applicationId}`}
        draft={{ id: applicationId, etag: one.data.meta.etag ?? '' }}
      />
    </Stack>
  );
}

/** The form itself, with the draft saved as each part is done and sent at the end. */
function ApplicationForm({
  me,
  projectId,
  form,
  initialAnswers,
  lockedKeys,
  storageKey,
  draft: existing,
}: {
  me: Me;
  projectId: string;
  form: Application['form'];
  initialAnswers: Answer[];
  lockedKeys: ReadonlySet<string>;
  storageKey: string;
  draft?: { id: string; etag: string };
}) {
  const t = useTranslations('applications.new');
  const queryClient = useQueryClient();
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Application | null>(null);
  const [saved, setSaved] = useState(false);
  // the draft on the server, once the first part is done; the version for the next write
  const draft = useRef<{ id: string; etag: string } | null>(existing ?? null);
  const teamMember = me.roles.includes(TEAM_MEMBER);

  /** Creates the draft the first time, patches it after; answers the record and its version. */
  const save = async ({ answers, clientUuid }: Submission) => {
    try {
      const result = draft.current
        ? await updateApplication(draft.current.id, draft.current.etag, answers)
        : await createApplication(projectId, { clientUuid, formVersionId: form.id, answers });
      draft.current = { id: result.data.id, etag: result.meta.etag ?? '' };
      setServerErrors({});
      setSaved(true);
      return result.data;
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 422 && error.details.length) {
        setServerErrors(namedOf(error));
        throw new Error(t('fix_named'), { cause: error });
      }
      if (error instanceof ApiFailure && error.code === 'beneficiary.mobile_is_volunteer_mobile')
        throw new Error(t('own_mobile'), { cause: error });
      if (error instanceof ApiFailure && error.code === 'beneficiary.already_applied')
        throw new Error(t('already_applied'), { cause: error });
      if (error instanceof ApiFailure && error.code === 'beneficiary.blocked')
        throw new Error(t('blocked'), { cause: error });
      throw new Error(error instanceof ApiFailure ? error.message : t('save_failed'), {
        cause: error,
      });
    }
  };

  const send = async (submission: Submission) => {
    const record = await save(submission);
    if (teamMember) {
      setSent(record);
      return;
    }
    try {
      const done = await actOn(record.id, draft.current!.etag, 'submit');
      setSent(done.data);
    } catch (error) {
      throw new Error(error instanceof ApiFailure ? error.message : t('send_failed'), {
        cause: error,
      });
    } finally {
      await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
    }
  };

  const upload: UploadAdapter = useMemo(
    () => ({
      accept: PHOTO_TYPES,
      maxSize: PHOTO_MAX_BYTES,
      upload: async (file, fieldKey, clientUuid) => {
        if (!draft.current) throw new Error(t('save_first'));
        const stored = await uploadFile(
          await compressImage(file),
          {
            kind: 'form_photo',
            entityType: 'application',
            entityId: draft.current.id,
            slot: fieldKey,
            source: 'gallery',
          },
          { clientUuid: `${clientUuid.slice(0, 24)}${fieldKey.slice(0, 12)}`.padEnd(36, '0') },
        );
        return { fileId: stored.id };
      },
      reasonOf: (error) =>
        error instanceof ApiFailure
          ? error.message
          : error instanceof Error
            ? error.message
            : t('upload_failed'),
    }),
    [t],
  );

  if (sent)
    return (
      <Card title={t('sent_title')} headingLevel={2}>
        <Stack gap={2}>
          <Text>{sent.appNo ? t('sent', { appNo: sent.appNo }) : t('sent_no_number')}</Text>
          <Stack direction="row" gap={2} wrap>
            <Button variant="primary" href="/my-applications">
              {t('see_mine')}
            </Button>
            <Button variant="secondary" href={`/my-projects/${projectId}/apply`}>
              {t('another')}
            </Button>
          </Stack>
        </Stack>
      </Card>
    );
  return (
    <Stack gap={3}>
      <h2>{t('form_title')}</h2>
      {saved ? (
        <Text tone="muted" role="status">
          {t('saved')}
        </Text>
      ) : null}
      <FormRenderer
        definition={form}
        audience="volunteer"
        today={isoDateInDhaka(new Date())}
        storageKey={storageKey}
        initialAnswers={initialAnswers}
        lockedKeys={lockedKeys}
        upload={upload}
        layout="auto"
        submitLabel={teamMember ? t('saved') : t('submit')}
        onPartDone={async (s) => {
          await save(s);
        }}
        onSubmit={send}
        serverErrors={serverErrors}
      />
    </Stack>
  );
}
