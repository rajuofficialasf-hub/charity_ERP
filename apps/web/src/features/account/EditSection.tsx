import { Alert, Button, Checkbox, Form, Text, TextField } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { isContact, isPhoto } from './ChangeRequests';
import { labelKey, type ProfileField, RequestBadge, Value } from './ProfileDetails';
import {
  askEdit,
  type ChangeRequest,
  type OwnProfile,
  PROFILE_KEY,
  REQUESTS_KEY,
  type RequestField,
} from './profile-api';
import { cleanValue, initialValue, ValueEditor } from './ValueEditor';

/** Marks a detail whose value the form could not make (nothing was sent for it). */
const MISSING = Symbol('missing');

/**
 * The edit mode of one section (T1.9d; BR-031 as amended by DECISION_LOG D-085): the person ticks
 * one or more details, gives the new values and one optional reason, and one request per ticked
 * detail is sent through the existing endpoint. A sent detail leaves the mode; a refused one stays
 * ticked with its message. The type has no tick (the Foundation decides it) and a detail that
 * already has a request waiting shows that instead.
 */
export function EditSection({
  me,
  title,
  fields,
  edits,
  onBusy,
  onDirty,
  onCancel,
  onSent,
}: {
  me: OwnProfile;
  title: string;
  fields: ProfileField[];
  /** The edit requests of the person that are open or waiting for the approver. */
  edits: ChangeRequest[];
  /** Tells the page a send is running, so the section can not be left meanwhile. */
  onBusy: (busy: boolean) => void;
  /** Tells the page whether a detail is ticked, so leaving the section can ask first. */
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
  onSent: () => void;
}) {
  const t = useTranslations('registration');
  const tc = useTranslations('common.action');
  const offline = useTranslations('auth.login')('offline');
  const tv = useTranslations('errors.validation');
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<ReadonlySet<RequestField>>(new Set());
  const [values, setValues] = useState<Partial<Record<RequestField, unknown>>>({});
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<RequestField, string>>>({});
  const [alert, setAlert] = useState<string | null>(null);

  const waitingFor = (field: ProfileField) => edits.find((r) => r.field === field);

  const send = useMutation({
    mutationFn: async () => {
      const sent: RequestField[] = [];
      const failed: [RequestField, unknown][] = [];
      for (const field of fields) {
        // a detail whose request appeared meanwhile is not asked for twice
        if (field === 'type' || !picked.has(field) || waitingFor(field)) continue;
        const value = isPhoto(field) ? undefined : cleanValue(field, values[field]);
        // a value the form cannot make (a permanent address without its four levels) is not sent
        if (!isPhoto(field) && value === undefined) {
          failed.push([field, MISSING]);
          continue;
        }
        try {
          await askEdit({
            field,
            ...(isPhoto(field) ? {} : { newValue: value }),
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
      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
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
      // a call that reached no server, or no field to blame, gets an alert of its own
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

  const toggle = (field: RequestField, on: boolean) => {
    setPicked((now) => {
      const next = new Set(now);
      if (on) next.add(field);
      else next.delete(field);
      return next;
    });
    setErrors((now) => ({ ...now, [field]: undefined }));
    // a group starts with what the volunteer has now, so a change is an edit, not a new entry
    if (on) setValues((now) => (field in now ? now : { ...now, [field]: initialValue(field, me) }));
  };

  return (
    <Form
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
            const label = t(labelKey(field));
            const request = waitingFor(field);
            const on = field !== 'type' && picked.has(field);
            return (
              <li key={field} className="profile-edit-row" data-picked={on}>
                {field === 'type' || request ? (
                  <>
                    <div className="profile-label">{label}</div>
                    <div className="profile-value">
                      <div className="profile-text">
                        <Value me={me} field={field} label={label} />
                      </div>
                      {request && <RequestBadge request={request} />}
                    </div>
                  </>
                ) : (
                  <>
                    <Checkbox isSelected={on} onChange={(selected) => toggle(field, selected)}>
                      {t('profile.edit.change_field', { field: label })}
                    </Checkbox>
                    {on ? (
                      <div className="profile-editor">
                        {isPhoto(field) ? (
                          <>
                            <Text>{t('profile.edit.photo_intro')}</Text>
                            {errors[field] && <p className="profile-error">{errors[field]}</p>}
                          </>
                        ) : (
                          <>
                            <ValueEditor
                              field={field}
                              label={label}
                              value={values[field]}
                              onChange={(value) => setValues((now) => ({ ...now, [field]: value }))}
                              error={errors[field]}
                            />
                            {isContact(field) && <Text>{t('profile.edit.code_intro')}</Text>}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="profile-text profile-current">
                        <Value me={me} field={field} label={label} />
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
        {alert && (
          <Alert tone="danger" live="alert">
            {alert}
          </Alert>
        )}
        <div className="profile-edit-actions">
          <Button variant="secondary" onPress={onCancel} disabled={send.isPending}>
            {tc('cancel')}
          </Button>
          <Button type="submit" loading={send.isPending} disabled={picked.size === 0}>
            {t('profile.edit.send')}
          </Button>
        </div>
      </div>
    </Form>
  );
}
