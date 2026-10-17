import {
  type Affiliation,
  AFFILIATIONS,
  type InvitationIssued,
  JOB_ID_MAX_LENGTH,
} from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Modal, RadioGroup, Select, TextField } from '@css/ui';
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

/** The Main Admin's role is never given to a new account (AUTH.md 11). */
const NOT_GIVEN = 'department_head';
const NONE = 'none';

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

  const programList = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const divisions = useQuery({
    queryKey: ['locations', 'divisions'],
    queryFn: () => locations(),
    staleTime: 60 * 60_000,
  });
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles, enabled: !official });
  // the version this edit started from, and the name of the current supervisor
  const version = useQuery({
    queryKey: ['admin', 'staff', 'one', official?.id],
    queryFn: () => staffWithEtag(official!.id),
    enabled: Boolean(official),
    staleTime: Infinity,
  });
  const currentSupervisor = useQuery({
    queryKey: ['admin', 'staff', 'one', official?.supervisorUserId],
    queryFn: () => staffWithEtag(official!.supervisorUserId!),
    enabled: Boolean(official?.supervisorUserId),
    staleTime: Infinity,
  });
  const chosenSupervisor =
    supervisorTouched || !currentSupervisor.data
      ? supervisor
      : asPanelUser(currentSupervisor.data.data);

  const profile = () => ({
    jobId: jobId.trim(),
    displayName: name.trim(),
    designation: designation.trim(),
    affiliation,
    affiliationUnit: affiliation === 'department' ? null : unit.trim() || null,
    homeProgramId: programId === NONE ? null : programId,
    homeDivisionId: divisionId === NONE ? null : divisionId,
    supervisorUserId: chosenSupervisor?.id ?? null,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (official)
        return { saved: await updateProfile(official.id, version.data!.meta.etag, profile()) };
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
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  /** The server's message for one field, when the refusal named it. */
  const fieldError = (path: string) => failure?.details.find((d) => d.path === path)?.message;

  const ready =
    jobId.trim() !== '' &&
    name.trim() !== '' &&
    designation.trim() !== '' &&
    (affiliation === 'department' || unit.trim() !== '') &&
    (official ? version.data !== undefined : email.trim() !== '' && roleKey !== null);
  const roleOptions = (roleList.data ?? [])
    .filter((r) => r.kind === 'official' && r.key !== NOT_GIVEN)
    .map((r) => ({ id: r.key, label: localized(r.name, locale) }));
  const programOptions = [
    { id: NONE, label: t('no_program') },
    ...(programList.data ?? []).map((p) => ({
      id: p.id,
      label: `${localized(p.name, locale)} (${p.code})`,
    })),
  ];
  const divisionOptions = [
    { id: NONE, label: t('no_division') },
    ...(divisions.data ?? []).map((d) => ({ id: d.id, label: localized(d.name, locale) })),
  ];

  return (
    <Modal
      title={official ? t('edit_title', { name: official.displayName }) : t('create_title')}
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {official ? tc('save') : t('create')}
        </Button>
      }
    >
      {save.error && (
        <Alert tone="danger" live="alert">
          {failure ? (failure.details[0]?.message ?? failure.message) : t('offline')}
        </Alert>
      )}
      <TextField
        label={t('job_id')}
        helper={t('job_id_hint')}
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
            helper={t('email_hint')}
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
          <Select
            label={t('role')}
            required
            value={roleKey}
            onChange={setRoleKey}
            options={roleOptions}
            searchable={false}
            error={fieldError('roleKey')}
          />
        </>
      )}
      <RadioGroup
        label={t('affiliation')}
        value={affiliation}
        onChange={(id) => setAffiliation(id as Affiliation)}
        options={AFFILIATIONS.map((a) => ({ id: a, label: ta(a) }))}
      />
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
      <Select
        label={t('program')}
        value={programId}
        onChange={(id) => setProgramId(id ?? NONE)}
        options={programOptions}
        error={fieldError('homeProgramId')}
      />
      <Select
        label={t('division')}
        value={divisionId}
        onChange={(id) => setDivisionId(id ?? NONE)}
        options={divisionOptions}
        error={fieldError('homeDivisionId')}
      />
      <UserSearch
        label={t('supervisor')}
        helper={fieldError('supervisorUserId') ?? t('supervisor_hint')}
        selected={chosenSupervisor}
        onSelect={(u) => {
          setSupervisorTouched(true);
          setSupervisor(u);
        }}
        search={{
          key: 'supervisors',
          find: async (text) =>
            (await findSupervisors(text)).filter((u) => u.id !== official?.id).map(asPanelUser),
        }}
      />
    </Modal>
  );
}
