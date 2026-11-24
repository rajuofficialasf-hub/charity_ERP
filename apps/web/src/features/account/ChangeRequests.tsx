import { PHOTO_SLOTS, type PhotoSlot } from '@css/shared/registration';
import { Alert, Button, Card, Chip, Form, Icon, Stack, Text, TextField } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useSchemaResolver } from '../../lib/form-schema';
import { PhotoField } from '../registration/PhotoField';
import {
  answerRequest,
  type ChangeRequest,
  FIELD_LABEL,
  PROFILE_KEY,
  REQUESTS_KEY,
  type RequestField,
  resubmit,
  sendContactCode,
  sendStaffContactCode,
  uploadOwnPhoto,
  verifyContactCode,
  verifyStaffContactCode,
} from './profile-api';
import { cleanValue, ValueEditor } from './ValueEditor';

export const isPhoto = (field: string): field is PhotoSlot =>
  (PHOTO_SLOTS as readonly string[]).includes(field);
export const isContact = (field: string) => field === 'mobile' || field === 'email';

/**
 * The message of a refused call: the field message of a 422, else the API's own message; a call
 * that reached no server says so (offline), so no alert is ever empty.
 */
function useMessageOf() {
  const offline = useTranslations('auth.login')('offline');
  return (error: unknown): string | null => {
    if (!error) return null;
    if (!(error instanceof ApiFailure)) return offline;
    return error.details[0]?.message ?? error.message;
  };
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
    void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
  };
}

/**
 * The correction requests of a pending registration (docs/BUSINESS_RULES.md, the corrections of a
 * registration): only the named fields
 * open, each answered on its own; "submit again" appears once every one is answered.
 */
export function Corrections({ requests }: { requests: ChangeRequest[] }) {
  const t = useTranslations('registration.profile.corrections');
  const messageOf = useMessageOf();
  const refresh = useRefresh();
  const rows = requests.filter((r) => r.kind === 'registration_correction');
  const again = useMutation({ mutationFn: resubmit, onSuccess: refresh });
  if (!rows.length && !again.isSuccess) return null;
  const allAnswered = rows.every((r) => r.status === 'submitted');
  // sent again and nothing new asked since: a later round of corrections shows its rows
  const sent = again.isSuccess && !rows.some((r) => r.status === 'open');
  return (
    <section aria-labelledby="corrections-title">
      <Stack gap={4}>
        <h2 id="corrections-title">{t('title')}</h2>
        {sent ? (
          <Alert tone="success">{t('resubmitted')}</Alert>
        ) : (
          <>
            <Text>{t('intro')}</Text>
            {rows.map((row) => (
              <CorrectionRow
                key={row.id}
                row={row}
                // one field asked: its answer sends the registration again in the same press
                alone={rows.length === 1}
                onAnswered={rows.length === 1 ? () => again.mutate() : refresh}
              />
            ))}
            {again.error && <Alert tone="error">{messageOf(again.error)}</Alert>}
            {/* one field sends itself with its answer; the button stays for a send that failed */}
            {allAnswered && (rows.length > 1 || again.isError) && (
              <Button onClick={() => again.mutate()} loading={again.isPending}>
                {t('resubmit')}
              </Button>
            )}
          </>
        )}
      </Stack>
    </section>
  );
}

function CorrectionRow({
  row,
  alone,
  onAnswered,
}: {
  row: ChangeRequest;
  alone: boolean;
  onAnswered: () => void;
}) {
  const t = useTranslations('registration');
  const messageOf = useMessageOf();
  const field = row.field as RequestField;
  const label = t(FIELD_LABEL[field] ?? 'form.name');
  // the new value as the editor holds it; the server checks it
  const schema = useMemo(() => z.object({ value: z.unknown() }), []);
  const form = useForm<{ value: unknown }>({
    resolver: useSchemaResolver(schema),
    defaultValues: { value: undefined },
  });
  const answer = useMutation({
    mutationFn: (newValue: unknown) => answerRequest(row.id, newValue),
    onSuccess: onAnswered,
  });
  const answered = row.status === 'submitted';
  const submit = ({ value }: { value: unknown }) => {
    if (!answer.isPending) answer.mutate(cleanValue(field, value));
  };
  return (
    <Card>
      <Form form={form} onSubmit={submit} label={label}>
        <Stack gap={3}>
          <Stack direction="row" align="center" gap={2}>
            <strong>{label}</strong>
            {answered && (
              <Chip tone="success">
                <Icon name="success" size={16} />
                {t('profile.corrections.answered')}
              </Chip>
            )}
          </Stack>
          {row.note && <Text>{t('profile.corrections.note', { note: row.note })}</Text>}
          {isPhoto(field) ? (
            <PhotoField
              label={label}
              upload={(photo) => uploadOwnPhoto(row.id, field, photo)}
              onUploaded={(fileId) => fileId && answer.mutate(fileId)}
              error={messageOf(answer.error) ?? undefined}
            />
          ) : (
            <>
              <Controller
                control={form.control}
                name="value"
                render={({ field: input }) => (
                  <ValueEditor
                    field={field}
                    label={label}
                    value={input.value}
                    onChange={input.onChange}
                    error={messageOf(answer.error) ?? undefined}
                  />
                )}
              />
              <Button
                type="submit"
                variant={alone ? 'primary' : 'secondary'}
                loading={answer.isPending}
              >
                {t(alone ? 'profile.corrections.answer_and_send' : 'profile.corrections.answer')}
              </Button>
            </>
          )}
        </Stack>
      </Form>
    </Card>
  );
}

/**
 * An open edit beside its detail: the code a new contact waits for, or the photo to upload. An
 * official's request sends and checks its code through the official's own routes.
 */
export function RequestState({
  row,
  field,
  label,
  official = false,
}: {
  row: ChangeRequest;
  field: string;
  label: string;
  official?: boolean;
}) {
  const t = useTranslations('registration');
  const messageOf = useMessageOf();
  const refresh = useRefresh();
  const [code, setCode] = useState('');
  // each action clears the other's result, so an old message never hides a new one
  const send = useMutation({
    mutationFn: () => (official ? sendStaffContactCode : sendContactCode)(row.id),
  });
  const verify = useMutation({
    mutationFn: () => (official ? verifyStaffContactCode : verifyContactCode)(row.id, code),
    onSuccess: refresh,
  });
  if (isPhoto(field))
    return (
      <PhotoField
        label={label}
        upload={(photo) => uploadOwnPhoto(row.id, field, photo)}
        onUploaded={(fileId) => fileId && refresh()}
      />
    );
  if (!isContact(field)) return null;
  return (
    <Stack gap={3}>
      <TextField
        label={t('profile.edit.code')}
        name={`code-${row.id}`}
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        hint={send.isSuccess ? t('profile.edit.code_sent') : undefined}
        error={messageOf(verify.error ?? send.error) ?? undefined}
        endAction={
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              verify.reset();
              send.mutate();
            }}
            loading={send.isPending}
          >
            {t('profile.edit.send_code')}
          </Button>
        }
      />
      <div>
        <Button
          onClick={() => {
            send.reset();
            verify.mutate();
          }}
          loading={verify.isPending}
          disabled={code.length !== 6}
        >
          {t('profile.edit.verify_code')}
        </Button>
      </div>
    </Stack>
  );
}
