import { AFFILIATIONS, type Affiliation, type OwnStaffProfile } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { REQUEST_FIELD_LABEL, type StaffEditField } from '@css/shared/registration';
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Form,
  FormTextField,
  RadioGroup,
  SelectField,
  Text,
  TextField,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { useFileDataUrl } from '../../components/FileImage';
import { ApiFailure } from '../../api/client';
import { flatErrors } from '../../lib/form-schema';
import { isContact, RequestState } from './ChangeRequests';
import {
  type EditFields,
  sendTogether,
  showSendResult,
  type TogetherOutcome,
  toggleDetail,
  useEditForm,
  usePicked,
  useSendKey,
} from './edit-form';
import { RequestBadge } from './ProfileDetails';
import {
  askStaffEdits,
  type ChangeRequest,
  REQUESTS_KEY,
  STAFF_CHOICES_KEY,
  STAFF_PROFILE_KEY,
  staffChoices,
} from './profile-api';

/** The details an official asks to change, by section; the rest only the deciders change. */
export const OFFICIAL_FIELDS = {
  identity: ['photo', 'displayName', 'designation', 'workplace', 'homeProgramId'],
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
  const form = useEditForm<StaffEditField>();
  const picked = usePicked(form);
  const errors = flatErrors(form.formState.errors);
  const alert = form.formState.errors.root?.server?.message;
  const waitingFor = (field: StaffEditField) => edits.find((r) => r.field === field);

  const keyFor = useSendKey();
  const send = useMutation({
    mutationFn: async ({
      picked: ticked,
      values,
      note,
    }: EditFields<StaffEditField>): Promise<TogetherOutcome<StaffEditField>> => {
      const requests: { field: StaffEditField; newValue?: unknown; note?: string }[] = [];
      const missing: StaffEditField[] = [];
      for (const field of fields) {
        // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
        if (!ticked[field] || waitingFor(field)) continue;
        const photo = field === 'photo';
        // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
        const value = photo ? undefined : cleanValue(field, values[field]);
        if (!photo && value === undefined) {
          missing.push(field);
          continue;
        }
        requests.push({
          field,
          ...(photo ? {} : { newValue: value }),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      }
      // all of them or none: a detail the form cannot make holds back the others too
      if (missing.length)
        return { sent: [], refused: missing.map((f) => [f, tv('required')]), error: MISSING };
      // every ticked detail is waiting already (a send whose answer the network lost): done
      if (!requests.length) return { sent: [], refused: [], error: null };
      return sendTogether(requests, (all) => askStaffEdits(all, keyFor(all)));
    },
    onSuccess: ({ refused, error }) => {
      void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
      void queryClient.invalidateQueries({ queryKey: STAFF_PROFILE_KEY });
      if (error === null) {
        onSent();
        return;
      }
      // nothing was sent: the details the refusal names say why, and one it does not place (or
      // a call that reached no server) gets an alert of its own
      const unplaced = error instanceof ApiFailure ? error.message : offline;
      showSendResult(form, [], refused, refused.length ? t('profile.edit.none_sent') : unplaced);
    },
  });

  const sending = send.isPending;
  useEffect(() => {
    onBusy(sending);
    return () => onBusy(false);
  }, [sending, onBusy]);
  const dirty = picked.length > 0;
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  return (
    <Form
      form={form}
      label={t('profile.edit.form_label', { section: title })}
      onSubmit={(values) => {
        if (picked.length && !send.isPending) send.mutate(values);
      }}
    >
      <div className="profile-edit">
        <p className="profile-pick">{t('profile.edit.pick')}</p>
        <ul className="profile-edit-list">
          {fields.map((field) => {
            const label = t(fieldLabelKey(field));
            const request = waitingFor(field);
            const on = picked.includes(field);
            const error = errors[`values.${field}`];
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
                      onChange={(selected) =>
                        toggleDetail(form, field, selected, () => initialValue(me, field))
                      }
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
                            <Controller
                              control={form.control}
                              name={`values.${field}`}
                              render={({ field: input }) => (
                                <ValueInput
                                  field={field}
                                  label={label}
                                  value={input.value}
                                  onChange={input.onChange}
                                  error={error}
                                />
                              )}
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
        {picked.length > 0 && <FormTextField label={t('profile.edit.note')} name="note" />}
        {alert && <Alert tone="error">{alert}</Alert>}
        <div className="profile-edit-actions">
          <Button variant="secondary" onClick={onCancel} disabled={send.isPending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={send.isPending} disabled={picked.length === 0}>
            {t('profile.edit.send')}
          </Button>
        </div>
      </div>
    </Form>
  );
}
