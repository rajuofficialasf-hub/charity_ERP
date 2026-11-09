import { AFFILIATIONS, type Affiliation, type OwnStaffProfile } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { REQUEST_FIELD_LABEL, type StaffEditField } from '@css/shared/registration';
import { Alert, Avatar, Button, Checkbox, RadioGroup, SelectField, Text, TextField } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { ApiFailure } from '../../lib/api';
import { locations } from '../registration/registration-api';
import { isContact, RequestState } from './ChangeRequests';
import { RequestBadge } from './ProfileDetails';
import {
  askStaffEdit,
  type ChangeRequest,
  REQUESTS_KEY,
  STAFF_CHOICES_KEY,
  STAFF_PROFILE_KEY,
  staffChoices,
} from './profile-api';

/** The details an official asks to change, by section; the rest only the deciders change. */
export const OFFICIAL_FIELDS = {
  identity: ['photo', 'displayName', 'designation', 'workplace', 'homeProgramId', 'homeDivisionId'],
  contact: ['mobile', 'email'],
} as const satisfies Record<string, readonly StaffEditField[]>;
export type OfficialSection = keyof typeof OFFICIAL_FIELDS;
export const fieldsOf = (section: OfficialSection): readonly StaffEditField[] =>
  section === 'identity' ? OFFICIAL_FIELDS.identity : OFFICIAL_FIELDS.contact;

const NONE = 'none';
type Workplace = { affiliation: Affiliation; affiliationUnit: string | null };
const MISSING = Symbol('missing');

// eslint-disable-next-line security/detect-object-injection -- a fixed list of field or section names
export const fieldLabelKey = (field: StaffEditField) => REQUEST_FIELD_LABEL[field];

/** The divisions to choose from, from the public location list (cached for an hour). */
function useDivisions() {
  return useQuery({
    queryKey: ['locations', 'divisions'],
    queryFn: () => locations(),
    staleTime: 60 * 60_000,
  });
}

/** The current value of an official's detail as text, or the photo. */
export function OfficialValue({
  me,
  field,
  label,
}: {
  me: OwnStaffProfile;
  field: StaffEditField;
  label: string;
}) {
  const ts = useTranslations('admin.staff');
  const empty = (
    <span className="profile-empty">{useTranslations('registration.profile')('empty')}</span>
  );
  const locale = useLocale() as Locale;
  const photo = useFileDataUrl(field === 'photo' ? me.photoFileId : null);
  switch (field) {
    case 'photo':
      return me.photoFileId ? <Avatar name={label} src={photo.data} size="large" /> : empty;
    case 'workplace':
      return me.affiliation ? (
        <>{[ts(`affiliation.${me.affiliation}`), me.affiliationUnit].filter(Boolean).join(' · ')}</>
      ) : (
        empty
      );
    case 'homeProgramId':
      return me.program ? <>{localized(me.program.name, locale)}</> : empty;
    case 'homeDivisionId':
      return me.division ? <>{localized(me.division.name, locale)}</> : empty;
    default: {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of field or section names
      const value = me[field];
      return value ? <>{value}</> : empty;
    }
  }
}

/** One detail of an official in view mode, with the state of its request and its next step. */
export function OfficialRow({
  label,
  value,
  request,
  field,
}: {
  label: string;
  value: ReactNode;
  request?: ChangeRequest;
  field?: StaffEditField;
}) {
  return (
    <div className="profile-row">
      <dt className="profile-label">{label}</dt>
      <dd className="profile-value">
        <div className="profile-text">{value}</div>
        {request && (
          <div className="profile-action">
            <RequestBadge request={request} />
          </div>
        )}
        {request?.status === 'open' && field && (
          <div className="profile-request">
            <RequestState row={request} field={field} label={label} official />
          </div>
        )}
      </dd>
    </div>
  );
}

/** The fixed details beside the requestable ones: the job ID, the roles, the supervisor, the account. */
export function FixedRows({ me, section }: { me: OwnStaffProfile; section: OfficialSection }) {
  const ts = useTranslations('admin.staff');
  const td = useTranslations('admin.staff.dialog');
  const tp = useTranslations('admin.staff.profile');
  const t = useTranslations('registration.profile');
  const locale = useLocale() as Locale;
  const empty = <span className="profile-empty">{t('empty')}</span>;
  if (section === 'contact')
    return (
      <>
        <OfficialRow label={tp('state')} value={t(`state.${me.state}`)} />
        <OfficialRow
          label={tp('last_login')}
          value={me.lastLoginAt ? formatDateTime(me.lastLoginAt, locale) : tp('never')}
        />
      </>
    );
  return (
    <>
      <OfficialRow
        label={ts('column.job_id')}
        value={me.jobId ? <span lang="en">{me.jobId}</span> : ts('no_job_id')}
      />
      <OfficialRow
        label={td('role')}
        value={me.roles.length ? me.roles.map((r) => localized(r.name, locale)).join(', ') : empty}
      />
      <OfficialRow label={td('supervisor')} value={me.supervisor?.name ?? empty} />
    </>
  );
}

function initialValue(me: OwnStaffProfile, field: StaffEditField): unknown {
  switch (field) {
    case 'workplace':
      return {
        affiliation: me.affiliation ?? 'department',
        affiliationUnit: me.affiliationUnit,
      } satisfies Workplace;
    case 'homeProgramId':
      return me.program?.id ?? NONE;
    case 'homeDivisionId':
      return me.division?.id ?? NONE;
    case 'photo':
      return undefined;
    default:
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of field or section names
      return me[field] ?? '';
  }
}

/** The value as the request carries it; undefined when the form cannot make one. */
function cleanValue(field: StaffEditField, value: unknown): unknown {
  switch (field) {
    case 'workplace': {
      const w = value as Workplace;
      const unit = w.affiliationUnit?.trim() ?? '';
      if (w.affiliation === 'department')
        return { affiliation: w.affiliation, affiliationUnit: null };
      return unit ? { affiliation: w.affiliation, affiliationUnit: unit } : undefined;
    }
    case 'homeProgramId':
    case 'homeDivisionId':
      return value === NONE ? null : value;
    default: {
      const text = typeof value === 'string' ? value.trim() : '';
      return text || undefined;
    }
  }
}

function ValueInput({
  field,
  label,
  value,
  onChange,
  error,
}: {
  field: StaffEditField;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
}) {
  const td = useTranslations('admin.staff.dialog');
  const ta = useTranslations('admin.staff.affiliation');
  const locale = useLocale() as Locale;
  const choices = useQuery({
    queryKey: STAFF_CHOICES_KEY,
    queryFn: staffChoices,
    enabled: field === 'homeProgramId',
  });
  const divisions = useDivisions();
  switch (field) {
    case 'workplace': {
      const w = value as Workplace;
      return (
        <>
          <RadioGroup
            label={label}
            value={w.affiliation}
            onChange={(id) =>
              onChange({
                affiliation: id as Affiliation,
                affiliationUnit: id === 'department' ? null : w.affiliationUnit,
              })
            }
            options={AFFILIATIONS.map((a) => ({ value: a, label: ta(a) }))}
          />
          {w.affiliation !== 'department' && (
            <TextField
              label={td(w.affiliation === 'foundation' ? 'unit_foundation' : 'unit_external')}
              required
              maxLength={200}
              value={w.affiliationUnit ?? ''}
              onChange={(unit) => onChange({ ...w, affiliationUnit: unit })}
              error={error}
            />
          )}
        </>
      );
    }
    case 'homeProgramId':
      return (
        <SelectField
          label={label}
          value={value as string}
          onChange={(id) => onChange(id || NONE)}
          options={[
            { value: NONE, label: td('no_program') },
            ...(choices.data?.programs ?? []).map((p) => ({
              value: p.id,
              label: localized(p.name, locale),
            })),
          ]}
          error={error}
        />
      );
    case 'homeDivisionId':
      return (
        <SelectField
          label={label}
          value={value as string}
          onChange={(id) => onChange(id || NONE)}
          options={[
            { value: NONE, label: td('no_division') },
            ...(divisions.data ?? []).map((d) => ({
              value: d.id,
              label: localized(d.name, locale),
            })),
          ]}
          error={error}
        />
      );
    default:
      return (
        <TextField
          label={label}
          value={value as string}
          onChange={onChange}
          maxLength={field === 'email' ? 254 : field === 'mobile' ? 11 : 200}
          {...(isContact(field)
            ? { lang: 'en', inputMode: field === 'mobile' ? 'tel' : 'email' }
            : {})}
          error={error}
        />
      );
  }
}

/**
 * The edit mode of one of an official's sections (docs/DECISION_LOG.md, the official's own
 * profile and the decision that the supervisor is not asked for): the person ticks details, gives the new
 * values and one optional reason, and one request per ticked detail goes to the Department Head
 * and the Monitoring Team. A detail with a request waiting shows that instead of a tick.
 */
export function OfficialEditSection({
  me,
  title,
  fields,
  edits,
  onBusy,
  onDirty,
  onCancel,
  onSent,
}: {
  me: OwnStaffProfile;
  title: string;
  fields: readonly StaffEditField[];
  edits: ChangeRequest[];
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
  onSent: () => void;
}) {
  const t = useTranslations('registration');
  const tc = useTranslations('common.action');
  const offline = useTranslations('auth.login')('offline');
  const tv = useTranslations('errors.validation');
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<ReadonlySet<StaffEditField>>(new Set());
  const [values, setValues] = useState<Partial<Record<StaffEditField, unknown>>>({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<StaffEditField, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const waitingFor = (field: StaffEditField) => edits.find((r) => r.field === field);

  const send = useMutation({
    mutationFn: async () => {
      const sent: StaffEditField[] = [];
      const failed: [StaffEditField, unknown][] = [];
      for (const field of fields) {
        if (!picked.has(field) || waitingFor(field)) continue;
        const photo = field === 'photo';
        // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
        const value = photo ? undefined : cleanValue(field, values[field]);
        if (!photo && value === undefined) {
          failed.push([field, MISSING]);
          continue;
        }
        try {
          await askStaffEdit({
            field,
            ...(photo ? {} : { newValue: value }),
            ...(note.trim() ? { note: note.trim() } : {}),
          });
          sent.push(field);
        } catch (error) {
          failed.push([field, error]);
        }
      }
      return { sent, failed };
    },
    onSuccess: ({ sent, failed }) => {
      void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: STAFF_PROFILE_KEY });
      if (!failed.length) {
        onSent();
        return;
      }
      const message = (error: unknown) =>
        error === MISSING
          ? tv('required')
          : error instanceof ApiFailure
            ? (error.details[0]?.message ?? error.message)
            : offline;
      setPicked((now) => new Set([...now].filter((f) => !sent.includes(f))));
      setErrors(Object.fromEntries(failed.map(([field, error]) => [field, message(error)])));
      const unplaced = failed.find(
        ([, error]) => !(error instanceof ApiFailure) && error !== MISSING,
      );
      setAlert(sent.length ? t('profile.edit.partial') : unplaced ? message(unplaced[1]) : null);
    },
  });

  const sending = send.isPending;
  useEffect(() => {
    onBusy(sending);
    return () => onBusy(false);
  }, [sending, onBusy]);
  const dirty = picked.size > 0;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  const toggle = (field: StaffEditField, on: boolean) => {
    setPicked((now) => {
      const next = new Set(now);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });
    setErrors((now) => ({ ...now, [field]: undefined }));
    if (on) setValues((now) => (field in now ? now : { ...now, [field]: initialValue(me, field) }));
  };

  return (
    <form
      method="post"
      noValidate
      aria-label={t('profile.edit.form_label', { section: title })}
      onSubmit={(event) => {
        event.preventDefault();
        if (picked.size && !send.isPending) {
          setErrors({});
          setAlert(null);
          send.mutate();
        }
      }}
    >
      <div className="profile-edit">
        <p className="profile-pick">{t('profile.edit.pick')}</p>
        <ul className="profile-edit-list">
          {fields.map((field) => {
            const label = t(fieldLabelKey(field));
            const request = waitingFor(field);
            const on = picked.has(field);
            // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
            const error = errors[field];
            return (
              <li key={field} className="profile-edit-row" data-picked={on}>
                {request ? (
                  <>
                    <div className="profile-label">{label}</div>
                    <div className="profile-value">
                      <div className="profile-text">
                        <OfficialValue me={me} field={field} label={label} />
                      </div>
                      <RequestBadge request={request} />
                    </div>
                  </>
                ) : (
                  <>
                    <Checkbox
                      label={t('profile.edit.change_field', { field: label })}
                      checked={on}
                      onChange={(selected) => toggle(field, selected)}
                    />
                    {on ? (
                      <div className="profile-editor">
                        {field === 'photo' ? (
                          <>
                            <Text>{t('profile.edit.photo_intro')}</Text>
                            {error && <p className="profile-error">{error}</p>}
                          </>
                        ) : (
                          <>
                            <ValueInput
                              field={field}
                              label={label}
                              // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
                              value={values[field]}
                              onChange={(value) => setValues((now) => ({ ...now, [field]: value }))}
                              error={error}
                            />
                            {isContact(field) && <Text>{t('profile.edit.code_intro')}</Text>}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="profile-text profile-current">
                        <OfficialValue me={me} field={field} label={label} />
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {picked.size > 0 && (
          <TextField label={t('profile.edit.note')} name="note" value={note} onChange={setNote} />
        )}
        {alert && <Alert tone="error">{alert}</Alert>}
        <div className="profile-edit-actions">
          <Button variant="secondary" onClick={onCancel} disabled={send.isPending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={send.isPending} disabled={picked.size === 0}>
            {t('profile.edit.send')}
          </Button>
        </div>
      </div>
    </form>
  );
}
