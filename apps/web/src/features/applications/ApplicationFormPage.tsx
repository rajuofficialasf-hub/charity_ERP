import type { Me } from '@css/shared/auth';
import { maxSizeOf } from '@css/shared/files';
import { failureReason } from '../sync/failure-reason';
import { type Answer, optionalIdentityOf } from '@css/shared/forms';
import { carriedIdentityRules, type IdentityRules } from '@css/shared/projects';
import { formatCount, formatDate, isoDateInDhaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Card, Icon, LinkButton, Skeleton, Stack, Text } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { uuidv7 } from '@css/shared';
import { Link, useLocation, useParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import type { LookupResult } from '../../admin/beneficiaries/beneficiaries-api';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../api/client';
import { failedOnTheWay, orCached } from '../../lib/or-cached';
import { compressImage } from '../../lib/compress';
import { readPhotoMeta } from '../../lib/photo-meta';
import { uploadFile } from '../../lib/uploads';
import { LookupField } from '../beneficiaries/LookupField';
import { FormRenderer, type Submission } from '../forms/FormRenderer';
import type { UploadAdapter } from '../forms/upload-adapter';
import { MY_PROJECTS_KEY, myProject } from '../projects/my-projects-api';
import {
  type Application,
  application,
  applicationForm,
  applicationKey,
  MY_APPLICATIONS_KEY,
} from './applications-api';
import {
  answersOfNumber,
  answersOfProfile,
  answersOfTyped,
  fieldByColumn,
  hasAddress,
  IDENTITY_COLUMN,
  lockedKeysOf,
  lockedNamesOf,
  type TypedPerson,
} from './identity-answers';
import { NameMatch } from './NameMatch';
import { loadStore, photoMessage, recordOf, storeMessage } from './use-local-records';
import './applications.css';

const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const PHOTO_MAX_BYTES = maxSizeOf('form_photo', 'image/jpeg') ?? 0;
const TEAM_MEMBER = 'volunteer_team_member';

/**
 * The person the identity step settled on: found by the number, new under it, or without one;
 * without one either picked from the people already here, a new person as typed, or a new person
 * whose lookup was left out for want of network.
 */
type Person =
  | { kind: 'known'; number: string; result: LookupResult }
  | { kind: 'new'; number: string }
  | { kind: 'picked'; typed: TypedPerson; pickToken: string }
  | { kind: 'without_document'; skipped: boolean };

/** How a new draft's person was found without a document, as the draft tells the server. */
type DraftPerson = { pickToken: string } | { nameLookupSkipped: true };

/** The refusals of the server that are about the person's identity number. */
const IDENTITY_REFUSALS: ReadonlySet<string> = new Set([
  'beneficiary.blocked',
  'beneficiary.already_applied',
  'beneficiary.lookup_outside_limit',
  'workflow.guard.identity_present',
]);
/** One empty set of refusals, so the form keeps the same object while nothing is refused. */
const NOT_REFUSED: Record<string, string> = {};

/**
 * A new application on a phone (docs/ui/SCREENS.md, "New application with NID lookup"): the person first, by NID or birth
 * registration; a known person's identity fills in and locks; where the project takes an
 * application without an identity document, the form also starts without a number, from the name;
 * then the project's form part by part, the draft saved as each part is done (so photos can join
 * it), and "অফিসে পাঠান" at the end, which answers with the number. A team member keeps the
 * draft for the main volunteer.
 * Every save goes through the phone's outbox, with or without network (docs/architecture/OFFLINE_SYNC.md,
 * outbox pattern and record lifecycle): online the screen waits for the server's answer, offline it
 * says the work is on the phone.
 */
export function ApplicationFormPage() {
  const t = useTranslations('applications.new');
  const { applicationId } = useParams();
  // "another application" leads to this same address as a new step of the history: the new
  // application starts empty, not on the screen of the one just sent
  const { key } = useLocation();
  return (
    <AccountPage title={() => (applicationId ? t('edit_title') : t('title'))}>
      {(me) =>
        applicationId ? (
          <EditDraft me={me} applicationId={applicationId} />
        ) : (
          <NewApplication key={key} me={me} />
        )
      }
    </AccountPage>
  );
}

/** The project's form from the server, or the cached one when the network is away. */
const formOf = (projectId: string) =>
  orCached(
    () => applicationForm(projectId),
    async () => (await loadStore()).cachedProjectForm(projectId),
  );

const projectOf = (projectId: string) =>
  orCached(
    () => myProject(projectId),
    async () => (await loadStore()).cachedProject(projectId),
  );

function NewApplication({ me }: { me: Me }) {
  const { projectId = '' } = useParams();
  const t = useTranslations('applications.new');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const project = useQuery({
    queryKey: [...MY_PROJECTS_KEY, projectId],
    queryFn: () => projectOf(projectId),
  });
  const form = useQuery({
    queryKey: ['projects', projectId, 'application-form'],
    queryFn: () => formOf(projectId),
    retry: false,
  });
  const [person, setPerson] = useState<Person | null>(null);
  const [lookup, setLookup] = useState<{ result: LookupResult; number: string } | null>(null);
  // the lookup of a person without a document, opened by its start
  const [matching, setMatching] = useState(false);
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
        {/* the project's read or the form's: the one that failed is named and both are asked again */}
        <LoadError
          title={t('load_failed')}
          error={project.error ?? form.error}
          onRetry={() => void Promise.all([project.refetch(), form.refetch()])}
        />
      </Stack>
    );
  const p = project.data;
  const definition = form.data;
  // a project read without its rules asks the document, as every project did before
  const rules = carriedIdentityRules(p.identityRules);
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
              <Alert tone="error">{t('blocked')}</Alert>
            ) : lookup && lookup.result.found && lookup.result.alreadyAppliedInProject ? (
              <Alert tone="warning">{t('already_applied')}</Alert>
            ) : lookup ? (
              <Button
                variant="primary"
                onClick={() =>
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
            {rules.document === 'optional' ? (
              <div className="apply-without-document">
                <Text tone="muted">{t('no_document_help')}</Text>
                {matching ? (
                  <NameMatch
                    projectId={projectId}
                    onChoose={(choice) =>
                      setPerson(
                        choice.kind === 'picked'
                          ? {
                              kind: 'picked',
                              // the names and the village as the profile writes them
                              typed: {
                                ...choice.typed,
                                name: choice.person.name,
                                fatherOrHusbandName: choice.person.fatherOrHusbandName,
                                village: choice.person.village,
                              },
                              pickToken: choice.pickToken,
                            }
                          : { kind: 'without_document', skipped: choice.kind === 'offline' },
                      )
                    }
                  />
                ) : (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() =>
                      // without network the lookup is left out and the form starts at once
                      navigator.onLine
                        ? setMatching(true)
                        : setPerson({ kind: 'without_document', skipped: true })
                    }
                  >
                    {t('start_without_document')}
                  </Button>
                )}
              </div>
            ) : null}
          </Stack>
        </Card>
      </Stack>
    );
  // a new person without a document starts with an empty form, as without the lookup
  const initial =
    person.kind === 'picked'
      ? answersOfTyped(definition, person.typed)
      : person.kind === 'without_document'
        ? []
        : person.kind === 'known' && person.result.autofill
          ? answersOfProfile(definition, person.number, person.result.autofill)
          : answersOfNumber(definition, person.number);
  // a person without a document whose lookup was left out: the office compares at the send
  const skipped = person.kind === 'without_document' && person.skipped;
  return (
    <Stack gap={3}>
      <DocumentTitle title={t('title')} />
      {back}
      {skipped ? <Alert tone="info">{t('match.offline')}</Alert> : null}
      <ApplicationForm
        me={me}
        projectId={projectId}
        form={definition}
        rules={rules}
        initialAnswers={initial}
        lockedKeys={
          person.kind === 'known'
            ? lockedKeysOf(definition)
            : person.kind === 'picked'
              ? lockedNamesOf(definition)
              : new Set()
        }
        person={
          person.kind === 'picked'
            ? { pickToken: person.pickToken }
            : skipped
              ? { nameLookupSkipped: true }
              : undefined
        }
      />
    </Stack>
  );
}

function EditDraft({ me, applicationId }: { me: Me; applicationId: string }) {
  const t = useTranslations('applications.detail');
  const one = useQuery({
    queryKey: applicationKey(applicationId),
    queryFn: () => recordOf(applicationId),
  });
  // the draft's project says which identity answers may stay empty; while it is not read, and
  // when it cannot be, the form asks both
  const projectId = one.data?.data.projectId;
  const project = useQuery({
    queryKey: [...MY_PROJECTS_KEY, projectId],
    queryFn: () => projectOf(projectId!),
    enabled: projectId !== undefined,
  });
  const back = <Link to={`/my-applications/${applicationId}`}>{t('back')}</Link>;
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        {back}
        <LoadError title={t('load_failed')} error={one.error} onRetry={() => void one.refetch()} />
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
        rules={carriedIdentityRules(project.data?.identityRules)}
        initialAnswers={record.answers}
        fillDefaults={false}
        lockedKeys={record.beneficiaryId ? lockedKeysOf(record.form) : new Set()}
        draft={{ id: applicationId, etag: one.data.meta.etag ?? '', local: record.local === true }}
      />
    </Stack>
  );
}

/** The draft as the screen tracks it: the phone's record, the server's id once known, and its version. */
interface Draft {
  clientUuid: string | null;
  serverId: string | null;
  etag: string | null;
}

/** What the end of the form shows: the record the office has, the draft kept for the lead, or the work waiting on the phone. */
type Sent =
  | { kind: 'sent'; record: Application | null; verification: string | null }
  | { kind: 'kept' }
  | { kind: 'queued' };

/** The form itself, with the draft saved as each part is done and sent at the end. */
function ApplicationForm({
  me,
  projectId,
  form,
  rules,
  initialAnswers,
  fillDefaults = true,
  lockedKeys,
  draft: existing,
  person,
}: {
  me: Me;
  projectId: string;
  form: Application['form'];
  /** What the project's application asks about identity and contact. */
  rules: IdentityRules;
  initialAnswers: Answer[];
  /** A stored draft keeps the answers it holds; a new application starts with the defaults. */
  fillDefaults?: boolean;
  lockedKeys: ReadonlySet<string>;
  draft?: { id: string; etag: string; local: boolean };
  /** How a new draft's person was found without a document; sent until the server holds the draft. */
  person?: DraftPerson;
}) {
  const t = useTranslations('applications.new');
  const ts = useTranslations('applications.sync');
  const tq = useTranslations('sync');
  const te = useTranslations('errors');
  const queryClient = useQueryClient();
  const [sent, setSent] = useState<Sent | null>(null);
  const [saved, setSaved] = useState(false);
  // what the server refused about the identity number, under that question until it is changed
  const [refused, setRefused] = useState(NOT_REFUSED);
  const draft = useRef<Draft>(
    existing
      ? existing.local
        ? { clientUuid: existing.id, serverId: null, etag: null }
        : { clientUuid: null, serverId: existing.id, etag: existing.etag }
      : { clientUuid: null, serverId: null, etag: null },
  );
  // one upload id per question's file, kept across a retry so the same session resumes
  const uploadIds = useRef(new Map<string, string>());
  const teamMember = me.roles.includes(TEAM_MEMBER);

  /**
   * The server's refusal of a record, in the reader's words: above the form, and under the
   * identity question too when the refusal is about the person's number.
   */
  const refusal = (code: string | null, params?: Record<string, string> | null): Error => {
    const reason = failureReason(te, code, params, t('save_failed'));
    const question =
      code && IDENTITY_REFUSALS.has(code) ? fieldByColumn(form, IDENTITY_COLUMN) : null;
    setRefused(question ? { [question.fieldKey]: reason } : NOT_REFUSED);
    return new Error(reason);
  };
  /** A failure of the store itself (no store and no network) in the reader's words, else the error as it came. */
  const worded = (error: unknown): Error =>
    new Error(
      storeMessage(error, ts) ?? (error instanceof Error ? error.message : t('save_failed')),
      {
        cause: error,
      },
    );

  /**
   * Writes the draft to the outbox and, with network, waits for the server's answer: the record
   * failed for good throws its reason; the accepted one gives the id and the version for the
   * next part. Without network the draft stays on the phone and the form goes on.
   */
  const save = async ({ answers, clientUuid }: Submission) => {
    const current = draft.current;
    // the server takes a draft only with its address: when the form asks the address in a
    // later part, the earlier parts stay in memory and the draft is made once the address is in
    if (!current.serverId && !current.clientUuid && !hasAddress(form, answers)) return;
    const store = await loadStore();
    const saved = await store
      .saveDraft({
        projectId,
        formVersionId: form.id,
        clientUuid: current.clientUuid ?? clientUuid,
        answers,
        server: current.serverId ? { id: current.serverId, etag: current.etag } : null,
        ...(person && !current.serverId ? { person } : {}),
      })
      .catch((error: unknown) => {
        throw worded(error);
      });
    if (!current.serverId) current.clientUuid = saved.clientUuid;
    if (navigator.onLine) {
      const state = await store.settle(saved.clientUuid);
      if (state?.state === 'failed') throw refusal(state.failureCode, state.failureParams);
      setRefused(NOT_REFUSED);
      const serverId = state?.serverId ?? current.serverId;
      if (serverId) {
        current.serverId = serverId;
        // the version the next edit starts from; without it the server settles the edit by time
        current.etag = await application(serverId)
          .then((r) => r.meta.etag ?? null)
          .catch(() => current.etag);
      }
    }
    // said once the record is where it will stay: on the server, or on the phone without network
    setSaved(true);
    await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
  };

  const send = async (submission: Submission) => {
    await save(submission);
    if (teamMember) {
      setSent({ kind: 'kept' });
      return;
    }
    const store = await loadStore();
    const id = await store
      .sendToOffice({
        projectId,
        formVersionId: form.id,
        draftClientUuid: draft.current.clientUuid,
        serverId: draft.current.serverId,
      })
      .catch((error: unknown) => {
        throw worded(error);
      });
    try {
      if (!navigator.onLine) {
        setSent({ kind: 'queued' });
        return;
      }
      const state = await store.settle(id);
      if (state?.state === 'failed') throw refusal(state.failureCode, state.failureParams);
      if (!state || state.state !== 'synced') {
        setSent({ kind: 'queued' });
        return;
      }
      const serverId = state.serverId ?? draft.current.serverId;
      const record = serverId
        ? await application(serverId)
            .then((r) => r.data)
            .catch(() => null)
        : null;
      setSent({ kind: 'sent', record, verification: state.verificationReason });
    } finally {
      await queryClient.invalidateQueries({ queryKey: MY_APPLICATIONS_KEY });
    }
  };

  const upload: UploadAdapter = useMemo(
    () => ({
      accept: PHOTO_TYPES,
      maxSize: PHOTO_MAX_BYTES,
      upload: async (file, fieldKey) => {
        const { serverId, clientUuid: recordId } = draft.current;
        if (!serverId && !recordId) throw new Error(t('save_first'));
        const meta = await readPhotoMeta(file);
        const blob = await compressImage(file);
        const facts = {
          name: file.name,
          mime: blob.type || file.type,
          source: 'gallery' as const,
          ...meta,
        };
        if (serverId && navigator.onLine) {
          // the record is the server's and there is network: the photo goes up now
          const key = `${fieldKey}:${file.name}:${file.size}:${file.lastModified}`;
          const clientUuid = uploadIds.current.get(key) ?? uuidv7();
          uploadIds.current.set(key, clientUuid);
          const { photoTarget } = await import('../../offline/photo-queue');
          try {
            const stored = await uploadFile(blob, photoTarget(serverId, fieldKey, facts), {
              clientUuid,
            });
            return { fileId: stored.id };
          } catch (error) {
            // a refusal is the server's word; a lost network sends the photo to the queue below
            if (!failedOnTheWay(error)) throw error;
          }
        }
        // the photo waits on the phone, under the record's own id or the server's, and goes after it
        const store = await loadStore();
        const queued = await store.queuePhoto({
          clientUuid: recordId ?? serverId!,
          slot: fieldKey,
          blob,
          facts,
        });
        return { fileId: queued.id, previewUrl: queued.previewUrl };
      },
      reasonOf: (error) =>
        photoMessage(error, tq) ??
        (error instanceof ApiFailure
          ? error.message
          : error instanceof Error
            ? error.message
            : t('upload_failed')),
    }),
    [t, tq],
  );

  if (sent) {
    const appNo = sent.kind === 'sent' ? (sent.record?.appNo ?? null) : null;
    return (
      <div className="apply-done">
        <span
          className={sent.kind === 'queued' ? 'apply-done-mark is-waiting' : 'apply-done-mark'}
          aria-hidden="true"
        >
          <Icon name={sent.kind === 'queued' ? 'cloud-upload' : 'check'} size={44} />
        </span>
        <h2 className="apply-done-title">
          {sent.kind === 'queued' ? ts('queued_title') : t('sent_title')}
        </h2>
        {appNo ? <span className="apply-done-number">{appNo}</span> : null}
        <div role="status">
          <Text tone="muted">
            {sent.kind === 'queued'
              ? ts('saved_on_phone')
              : appNo
                ? t('sent', { appNo })
                : t('sent_no_number')}
          </Text>
        </div>
        <div className="apply-done-actions">
          <LinkButton variant="primary" fullWidth to={`/my-projects/${projectId}/apply`}>
            {t('another')}
          </LinkButton>
          <LinkButton variant="secondary" fullWidth to="/my-applications">
            {t('see_mine')}
          </LinkButton>
        </div>
      </div>
    );
  }
  // the draft's mark beside the parts: on the server, or on the phone without network
  const status = saved ? (
    <span className="apply-saved" role="status">
      <Icon name="check" size={14} />
      {navigator.onLine ? t('saved') : ts('saved_on_phone')}
    </span>
  ) : null;
  return (
    <Stack gap={3}>
      <h2>{t('form_title')}</h2>
      <FormRenderer
        status={status}
        definition={form}
        audience="volunteer"
        today={isoDateInDhaka(new Date())}
        initialAnswers={initialAnswers}
        fillDefaults={fillDefaults}
        lockedKeys={lockedKeys}
        upload={upload}
        layout="auto"
        submitLabel={teamMember ? t('saved') : t('submit')}
        onPartDone={save}
        onSubmit={send}
        serverErrors={refused}
        optionalIdentity={optionalIdentityOf(rules, 'volunteer')}
      />
    </Stack>
  );
}
