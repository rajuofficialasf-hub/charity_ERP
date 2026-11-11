import { Alert, Button, Checkbox, Form, FormTextField, Text } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { flatErrors } from '../../lib/form-schema';
import { isContact, isPhoto } from './ChangeRequests';
import { type EditFields, showSendResult, toggleDetail, useEditForm, usePicked } from './edit-form';
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
 * The edit mode of one section (docs/BUSINESS_RULES.md, the edit requests of an approved volunteer,
 * as amended in docs/DECISION_LOG.md): the person ticks
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
  const form = useEditForm<RequestField>();
  const picked = usePicked(form);
  const errors = flatErrors(form.formState.errors);
  const alert = form.formState.errors.root?.server?.message;

  const waitingFor = (field: ProfileField) => edits.find((r) => r.field === field);

  const send = useMutation({
    mutationFn: async ({ picked: ticked, values, note }: EditFields<RequestField>) => {
      const sent: RequestField[] = [];
      const failed: [RequestField, unknown][] = [];
      for (const field of fields) {
        // a detail whose request appeared meanwhile is not asked for twice
        if (field === 'type' || !ticked[field] || waitingFor(field)) continue;
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
      // a call that reached no server, or no field to blame, gets an alert of its own
      const unplaced = failed.find(
        ([, error]) => !(error instanceof ApiFailure) && error !== MISSING,
      );
      showSendResult(
        form,
        sent,
        failed.map(([field, error]) => [field, message(error)]),
        sent.length ? t('profile.edit.partial') : unplaced ? message(unplaced[1]) : null,
      );
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
            const label = t(labelKey(field));
            const request = waitingFor(field);
            const on = field !== 'type' && picked.includes(field);
            const error = errors[`values.${field}`];
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
                    <Checkbox
                      label={t('profile.edit.change_field', { field: label })}
                      checked={on}
                      onChange={(selected) =>
                        toggleDetail(form, field, selected, () => initialValue(field, me))
                      }
                    />
                    {on ? (
                      <div className="profile-editor">
                        {isPhoto(field) ? (
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
                                <ValueEditor
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
                        <Value me={me} field={field} label={label} />
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
