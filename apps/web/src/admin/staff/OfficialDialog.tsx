import {
  type Affiliation,
  AFFILIATIONS,
  type InvitationIssued,
  JOB_ID_MAX_LENGTH,
  jobIdSchema,
} from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Dialog,
  Form,
  FormSelectField,
  FormTextField,
  RadioGroup,
  SelectField,
  Skeleton,
  Stepper,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, type Path, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { roles } from '../registrations/registrations-api';
import { type PanelUser, UserSearch } from '../UserSearch';
import {
  createOfficial,
  findSupervisors,
  jobIdTaken,
  type StaffMember,
  staffWithEtag,
  updateProfile,
} from './staff-api';
import './staff.css';
import { mayGiveRole } from '../roles';
import { LoadError } from '../../components/LoadError';

const NONE = 'none';
/** The fields of the first step (identity and contacts). */
const FIRST_STEP = ['jobId', 'displayName', 'designation', 'email', 'mobile'];

const asPanelUser = (u: StaffMember): PanelUser => ({
  id: u.id,
  displayName: u.jobId ? `${u.displayName} (${u.jobId})` : u.displayName,
  designation: u.designation,
  roles: u.roles,
});

/**
 * A new official: job ID, name, designation, email, mobile, role,
 * affiliation with its unit, home program and supervisor; the server creates the account
 * and the set-password link. With `official` it edits the profile of an existing official instead
 * (job ID, name, designation, affiliation, program, supervisor) with the version read
 * when it opened. The server checks every field again and answers per field.
 */
export function OfficialDialog({
  official,
  onClose,
  onCreated,
  onSaved,
}: {
  /** The official whose profile is edited; absent for a new one. */
  official?: StaffMember;
  onClose: () => void;
  onCreated?: (name: string, issued: InvitationIssued) => void;
  onSaved?: (saved: StaffMember) => void;
}) {
  const t = useTranslations('admin.staff.dialog');
  const [stale, setStale] = useState(false);
  // an edit starts from the record as stored now, with its version: never from the list row
  const version = useQuery({
    queryKey: ['admin', 'staff', 'edit', official?.id],
    queryFn: () => staffWithEtag(official!.id),
    enabled: Boolean(official),
    staleTime: 0,
    gcTime: 0,
  });
  if (!official) return <OfficialForm onClose={onClose} onCreated={onCreated} />;
  if (version.isPending || version.error)
    return (
      <Dialog title={t('edit_title', { name: official.displayName })} open onClose={onClose}>
        {version.error ? (
          <LoadError error={version.error} onRetry={() => void version.refetch()} />
        ) : (
          <Skeleton shape="card" />
        )}
      </Dialog>
    );
  return (
    <OfficialForm
      // a newer version starts the form again from what is stored
      key={version.data.meta.etag}
      official={version.data.data}
      etag={version.data.meta.etag}
      stale={stale}
      onStale={() => {
        setStale(true);
        void version.refetch();
      }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

const REQUIRED = 'validation.required';

/**
 * The fields of both steps. The first step's are checked before the second opens: an email only
 * needs its shape and a mobile, when written, its format (the server checks every field again).
 * `supervisor` is the official picked in the search, undefined while the stored one stays.
 */
function officialSchema(create: boolean) {
  return z
    .object({
      jobId: z.string(),
      displayName: z.string(),
      designation: z.string(),
      email: z.string(),
      mobile: z.string(),
      roleKey: z.string(),
      affiliation: z.enum(AFFILIATIONS),
      affiliationUnit: z.string(),
      homeProgramId: z.string(),
      supervisor: z.custom<PanelUser | null | undefined>(),
      supervisorUserId: z.string().nullable(),
    })
    .superRefine((v, ctx) => {
      const say = (path: string, message: string) =>
        ctx.addIssue({ code: 'custom', path: [path], message });
      if (!v.jobId.trim()) say('jobId', REQUIRED);
      else {
        const job = jobIdSchema.safeParse(v.jobId);
        if (!job.success) say('jobId', job.error.issues[0]!.message);
      }
      if (!v.displayName.trim()) say('displayName', REQUIRED);
      if (!v.designation.trim()) say('designation', REQUIRED);
      if (create) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) say('email', REQUIRED);
        if (v.mobile.trim() && !/^01[3-9][0-9]{8}$/.test(v.mobile.trim()))
          say('mobile', 'validation.mobile_format');
        if (!v.roleKey) say('roleKey', REQUIRED);
      }
      if (v.affiliation !== 'department' && !v.affiliationUnit.trim())
        say('affiliationUnit', REQUIRED);
    });
}
type OfficialFields = z.infer<ReturnType<typeof officialSchema>>;

function OfficialForm({
  official,
  etag,
  stale = false,
  onStale,
  onClose,
  onCreated,
  onSaved,
}: {
  official?: StaffMember;
  etag?: string;
  /** The profile changed meanwhile and the form shows the stored one again. */
  stale?: boolean;
  onStale?: () => void;
  onClose: () => void;
  onCreated?: (name: string, issued: InvitationIssued) => void;
  onSaved?: (saved: StaffMember) => void;
}) {
  const t = useTranslations('admin.staff.dialog');
  const ta = useTranslations('admin.staff.affiliation');
  const tc = useTranslations('common.action');
  const te = useTranslations('errors');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const schema = useMemo(() => officialSchema(!official), [official]);
  const form = useForm<OfficialFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      jobId: official?.jobId ?? '',
      displayName: official?.displayName ?? '',
      designation: official?.designation ?? '',
      email: '',
      mobile: '',
      roleKey: '',
      affiliation: official?.affiliation ?? 'department',
      affiliationUnit: official?.affiliationUnit ?? '',
      homeProgramId: official?.homeProgramId ?? NONE,
      supervisor: undefined,
      supervisorUserId: official?.supervisorUserId ?? null,
    },
    reValidateMode: 'onSubmit',
  });
  const [affiliation, unit, roleKey, supervisor] = useWatch({
    control: form.control,
    name: ['affiliation', 'affiliationUnit', 'roleKey', 'supervisor'],
  });
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  const [step, setStep] = useState(0);

  const programList = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: !official });
  // the name of the current supervisor, for the field only: the id is on the record
  const currentSupervisor = useQuery({
    queryKey: ['admin', 'staff', 'one', official?.supervisorUserId],
    queryFn: () => staffWithEtag(official!.supervisorUserId!),
    enabled: Boolean(official?.supervisorUserId),
  });
  const shownSupervisor =
    supervisor !== undefined
      ? supervisor
      : currentSupervisor.data
        ? asPanelUser(currentSupervisor.data.data)
        : null;

  const profile = (v: OfficialFields) => ({
    jobId: v.jobId.trim(),
    displayName: v.displayName.trim(),
    designation: v.designation.trim(),
    affiliation: v.affiliation,
    affiliationUnit: v.affiliation === 'department' ? null : v.affiliationUnit.trim() || null,
    homeProgramId: v.homeProgramId === NONE ? null : v.homeProgramId,
    // untouched, the stored supervisor stays, whether or not the name has loaded
    supervisorUserId: v.supervisorUserId,
  });
  const save = async (v: OfficialFields) => {
    try {
      if (official) onSaved?.(await updateProfile(official.id, etag!, profile(v)));
      else {
        const issued = await createOfficial({
          ...profile(v),
          email: v.email.trim().toLowerCase(),
          mobile: v.mobile.trim() || null,
          roleKey: v.roleKey,
          language: locale,
        });
        onCreated?.(v.displayName.trim(), issued);
      }
    } catch (failure) {
      showFailure(form, failure, t('offline'));
      if (!(failure instanceof ApiFailure)) return;
      // someone else saved the profile meanwhile: the stored one comes back to check first
      if (failure.status === 412) onStale?.();
      // a refusal for a field of the first step opens that step again
      if (failure.details.some((d) => FIRST_STEP.includes(d.path ?? ''))) setStep(0);
    }
  };
  // the second step's button sends; a first-step field the check refuses opens that step again
  const submit = () =>
    void form.handleSubmit(save, (errors) => {
      if (FIRST_STEP.some((path) => path in errors)) setStep(0);
    })();

  /** The first step's fields, checked before the second step opens (the server checks again). */
  const next = async () => {
    if (!(await form.trigger(FIRST_STEP as Path<OfficialFields>[]))) return;
    // a Job ID another official holds is told now, not after the second step; without an
    // answer the second step opens and the save checks it
    const jobId = form.getValues('jobId').trim();
    // the official's own Job ID, in any case, is not taken by them
    if (!official || jobId.toLowerCase() !== (official.jobId ?? '').toLowerCase()) {
      const taken = await jobIdTaken(jobId).catch(() => false);
      if (taken) {
        form.setError('jobId', { message: te('user.job_id_taken') });
        return;
      }
    }
    setStep(1);
  };

  const ready =
    (affiliation === 'department' || unit.trim() !== '') &&
    (official ? etag !== undefined : roleKey !== '');
  const roleOptions = (roleList.data ?? [])
    // an Admin and the Department Head are an Admin's to give
    .filter((r) => r.kind === 'official' && me !== null && mayGiveRole(me, r.key))
    .map((r) => ({ value: r.key, label: localized(r.name, locale) }));
  const programOptions = [
    { value: NONE, label: t('no_program') },
    ...(programList.data ?? []).map((p) => ({
      value: p.id,
      label: `${localized(p.name, locale)} (${p.code})`,
    })),
  ];
  const steps = [t('step_identity'), t('step_place')];

  const title = official ? t('edit_title', { name: official.displayName }) : t('create_title');

  return (
    <Dialog
      title={title}
      size="large"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        step === 0 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void next()}>{t('next')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(0)} disabled={pending}>
              {t('back')}
            </Button>
            <Button onClick={submit} disabled={!ready} loading={pending}>
              {official ? tc('save') : t('create')}
            </Button>
          </>
        )
      }
    >
      <Form form={form} onSubmit={save} label={title}>
        <div className="official-steps">
          <Stepper
            label={t('steps')}
            steps={steps}
            current={step}
            onSelect={(i) => (i === 0 ? setStep(0) : void next())}
          />
        </div>
        {stale && !error && <Alert tone="warning">{t('stale')}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {step === 0 ? (
          <div className="official-form">
            <FormTextField
              name="jobId"
              label={t('job_id')}
              hint={t('job_id_hint')}
              required
              maxLength={JOB_ID_MAX_LENGTH}
              lang="en"
            />
            <FormTextField name="displayName" label={t('name')} required maxLength={200} />
            <FormTextField name="designation" label={t('designation')} required maxLength={200} />
            {!official && (
              <>
                <FormTextField
                  name="email"
                  label={t('email')}
                  hint={t('email_hint')}
                  type="email"
                  required
                  maxLength={254}
                  lang="en"
                />
                <FormTextField name="mobile" label={t('mobile')} inputMode="tel" maxLength={11} />
              </>
            )}
          </div>
        ) : (
          <div className="official-form">
            {!official && (
              <FormSelectField
                name="roleKey"
                label={t('role')}
                required
                options={roleOptions}
                searchable={false}
              />
            )}
            <div className="official-form-wide">
              <Controller
                control={form.control}
                name="affiliation"
                render={({ field, fieldState }) => (
                  <RadioGroup
                    label={t('affiliation')}
                    value={field.value}
                    onChange={(id) => field.onChange(id as Affiliation)}
                    error={fieldState.error?.message}
                    options={AFFILIATIONS.map((a) => ({ value: a, label: ta(a) }))}
                  />
                )}
              />
            </div>
            {affiliation !== 'department' && (
              <FormTextField
                name="affiliationUnit"
                label={affiliation === 'foundation' ? t('unit_foundation') : t('unit_external')}
                required
                maxLength={200}
              />
            )}
            <Controller
              control={form.control}
              name="homeProgramId"
              render={({ field, fieldState }) => (
                <SelectField
                  label={t('program')}
                  value={field.value}
                  onChange={(id) => field.onChange(id || NONE)}
                  options={programOptions}
                  error={fieldState.error?.message}
                />
              )}
            />
            <div className="official-form-wide">
              <UserSearch
                label={t('supervisor')}
                helper={form.formState.errors.supervisorUserId?.message ?? t('supervisor_hint')}
                selected={shownSupervisor}
                onSelect={(u) => {
                  form.setValue('supervisor', u);
                  form.setValue('supervisorUserId', u?.id ?? null);
                }}
                search={{
                  key: 'supervisors',
                  find: async (text) =>
                    (await findSupervisors(text))
                      .filter((u) => u.id !== official?.id)
                      .map(asPanelUser),
                }}
              />
            </div>
          </div>
        )}
      </Form>
    </Dialog>
  );
}
