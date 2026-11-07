import {
  type Affiliation,
  AFFILIATIONS,
  type InvitationIssued,
  JOB_ID_MAX_LENGTH,
  jobIdSchema,
} from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Dialog, RadioGroup, SelectField, Skeleton, Stepper, TextField } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { locations } from '../../features/registration/registration-api';
import { ApiFailure } from '../../lib/api';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { roles } from '../registrations/registrations-api';
import { type PanelUser, UserSearch } from '../UserSearch';
import {
  createOfficial,
  findSupervisors,
  type StaffMember,
  staffWithEtag,
  updateProfile,
} from './staff-api';
import './staff.css';
import { LoadError } from '../../components/LoadError';

/** The Main Admin's role is never given to a new account (AUTH.md 11). */
const NOT_GIVEN = 'department_head';
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
 * A new official (DECISION_LOG D-097, BR-261): job ID, name, designation, email, mobile, role,
 * affiliation with its unit, home program, division and supervisor; the server creates the account
 * and the set-password link. With `official` it edits the profile of an existing official instead
 * (job ID, name, designation, affiliation, program, division, supervisor) with the version read
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
  const locale = useLocale() as Locale;
  const [jobId, setJobId] = useState(official?.jobId ?? '');
  const [name, setName] = useState(official?.displayName ?? '');
  const [designation, setDesignation] = useState(official?.designation ?? '');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [roleKey, setRoleKey] = useState<string | null>(null);
  const [affiliation, setAffiliation] = useState<Affiliation>(
    official?.affiliation ?? 'department',
  );
  const [unit, setUnit] = useState(official?.affiliationUnit ?? '');
  const [programId, setProgramId] = useState<string>(official?.homeProgramId ?? NONE);
  const [divisionId, setDivisionId] = useState<string>(official?.homeDivisionId ?? NONE);
  const [supervisor, setSupervisor] = useState<PanelUser | null>(null);
  const [supervisorTouched, setSupervisorTouched] = useState(false);
  const [step, setStep] = useState(0);

  const programList = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const divisions = useQuery({
    queryKey: ['locations', 'divisions'],
    queryFn: () => locations(),
    staleTime: 60 * 60_000,
  });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: !official });
  // the name of the current supervisor, for the field only: the id is on the record
  const currentSupervisor = useQuery({
    queryKey: ['admin', 'staff', 'one', official?.supervisorUserId],
    queryFn: () => staffWithEtag(official!.supervisorUserId!),
    enabled: Boolean(official?.supervisorUserId),
  });
  const shownSupervisor = supervisorTouched
    ? supervisor
    : currentSupervisor.data
      ? asPanelUser(currentSupervisor.data.data)
      : null;

  const profile = () => ({
    jobId: jobId.trim(),
    displayName: name.trim(),
    designation: designation.trim(),
    affiliation,
    affiliationUnit: affiliation === 'department' ? null : unit.trim() || null,
    homeProgramId: programId === NONE ? null : programId,
    homeDivisionId: divisionId === NONE ? null : divisionId,
    // untouched, the stored supervisor stays, whether or not the name has loaded
    supervisorUserId: supervisorTouched
      ? (supervisor?.id ?? null)
      : (official?.supervisorUserId ?? null),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (official) return { saved: await updateProfile(official.id, etag!, profile()) };
      return {
        issued: await createOfficial({
          ...profile(),
          email: email.trim().toLowerCase(),
          mobile: mobile.trim() || null,
          roleKey: roleKey!,
          language: locale,
        }),
      };
    },
    onSuccess: (result) => {
      if ('saved' in result && result.saved) onSaved?.(result.saved);
      if ('issued' in result && result.issued) onCreated?.(name.trim(), result.issued);
    },
    // someone else saved the profile meanwhile: the stored one comes back to check first
    onError: (error) => {
      if (error instanceof ApiFailure && error.status === 412) onStale?.();
      // a refusal for a field of the first step opens that step again
      if (
        error instanceof ApiFailure &&
        error.details.some((d) => FIRST_STEP.includes(d.path ?? ''))
      )
        setStep(0);
    },
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;

  const te = useTranslations('errors');
  const [checks, setChecks] = useState<Map<string, string>>(new Map());
  /** The first step's fields, checked before the second step opens (the server checks again). */
  const firstStepProblems = () => {
    const found = new Map<string, string>();
    const job = jobIdSchema.safeParse(jobId);
    if (!jobId.trim()) found.set('jobId', te('validation.required'));
    else if (!job.success)
      found.set('jobId', te(job.error.issues[0]!.message as 'validation.required'));
    if (!name.trim()) found.set('displayName', te('validation.required'));
    if (!designation.trim()) found.set('designation', te('validation.required'));
    if (!official) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        found.set('email', te('validation.required'));
      if (mobile.trim() && !/^01[3-9][0-9]{8}$/.test(mobile.trim()))
        found.set('mobile', te('validation.mobile_format'));
    }
    return found;
  };
  const next = () => {
    const found = firstStepProblems();
    setChecks(found);
    if (!found.size) setStep(1);
  };
  const fieldError = (path: string) =>
    checks.get(path) ?? failure?.details.find((d) => d.path === path)?.message;

  const ready =
    (affiliation === 'department' || unit.trim() !== '') &&
    (official ? etag !== undefined : roleKey !== null);
  const roleOptions = (roleList.data ?? [])
    .filter((r) => r.kind === 'official' && r.key !== NOT_GIVEN)
    .map((r) => ({ value: r.key, label: localized(r.name, locale) }));
  const programOptions = [
    { value: NONE, label: t('no_program') },
    ...(programList.data ?? []).map((p) => ({
      value: p.id,
      label: `${localized(p.name, locale)} (${p.code})`,
    })),
  ];
  const divisionOptions = [
    { value: NONE, label: t('no_division') },
    ...(divisions.data ?? []).map((d) => ({ value: d.id, label: localized(d.name, locale) })),
  ];
  const steps = [t('step_identity'), t('step_place')];

  return (
    <Dialog
      title={official ? t('edit_title', { name: official.displayName }) : t('create_title')}
      size="large"
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        step === 0 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button onClick={next}>{t('next')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(0)} disabled={save.isPending}>
              {t('back')}
            </Button>
            <Button onClick={() => save.mutate()} disabled={!ready} loading={save.isPending}>
              {official ? tc('save') : t('create')}
            </Button>
          </>
        )
      }
    >
      <div className="official-steps">
        <Stepper
          label={t('steps')}
          steps={steps}
          current={step}
          onSelect={(i) => (i === 0 ? setStep(0) : next())}
        />
      </div>
      {stale && !save.error && <Alert tone="warning">{t('stale')}</Alert>}
      {save.error && (
        <Alert tone="error">
          {failure ? (failure.details[0]?.message ?? failure.message) : t('offline')}
        </Alert>
      )}
      {step === 0 ? (
        <div className="official-form">
          <TextField
            label={t('job_id')}
            hint={t('job_id_hint')}
            required
            maxLength={JOB_ID_MAX_LENGTH}
            lang="en"
            value={jobId}
            onChange={setJobId}
            error={fieldError('jobId')}
          />
          <TextField
            label={t('name')}
            required
            maxLength={200}
            value={name}
            onChange={setName}
            error={fieldError('displayName')}
          />
          <TextField
            label={t('designation')}
            required
            maxLength={200}
            value={designation}
            onChange={setDesignation}
            error={fieldError('designation')}
          />
          {!official && (
            <>
              <TextField
                label={t('email')}
                hint={t('email_hint')}
                type="email"
                required
                maxLength={254}
                lang="en"
                value={email}
                onChange={setEmail}
                error={fieldError('email')}
              />
              <TextField
                label={t('mobile')}
                inputMode="tel"
                maxLength={11}
                value={mobile}
                onChange={setMobile}
                error={fieldError('mobile')}
              />
            </>
          )}
        </div>
      ) : (
        <div className="official-form">
          {!official && (
            <SelectField
              label={t('role')}
              required
              value={roleKey ?? ''}
              onChange={(v) => setRoleKey(v || null)}
              options={roleOptions}
              searchable={false}
              error={fieldError('roleKey')}
            />
          )}
          <div className="official-form-wide">
            <RadioGroup
              label={t('affiliation')}
              value={affiliation}
              onChange={(id) => setAffiliation(id as Affiliation)}
              options={AFFILIATIONS.map((a) => ({ value: a, label: ta(a) }))}
            />
          </div>
          {affiliation !== 'department' && (
            <TextField
              label={affiliation === 'foundation' ? t('unit_foundation') : t('unit_external')}
              required
              maxLength={200}
              value={unit}
              onChange={setUnit}
              error={fieldError('affiliationUnit')}
            />
          )}
          <SelectField
            label={t('program')}
            value={programId}
            onChange={(id) => setProgramId(id || NONE)}
            options={programOptions}
            error={fieldError('homeProgramId')}
          />
          <SelectField
            label={t('division')}
            value={divisionId}
            onChange={(id) => setDivisionId(id || NONE)}
            options={divisionOptions}
            error={fieldError('homeDivisionId')}
          />
          <div className="official-form-wide">
            <UserSearch
              label={t('supervisor')}
              helper={fieldError('supervisorUserId') ?? t('supervisor_hint')}
              selected={shownSupervisor}
              onSelect={(u) => {
                setSupervisorTouched(true);
                setSupervisor(u);
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
    </Dialog>
  );
}
