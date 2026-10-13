import { PHOTO_SLOTS, type PhotoSlot } from '@css/shared/registration';
import { Alert, Badge, Button, Card, Form, TextField } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
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
  uploadOwnPhoto,
  verifyContactCode,
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
 * The correction requests of a pending registration (BR-030, SCR-003): only the named fields
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
  return (
    <section aria-labelledby="corrections-title" className="flex flex-col gap-4">
      <h2 id="corrections-title">{t('title')}</h2>
      {again.isSuccess ? (
        <Alert tone="success" live="status">
          {t('resubmitted')}
        </Alert>
      ) : (
        <>
          <p className="m-0">{t('intro')}</p>
          {rows.map((row) => (
            <CorrectionRow key={row.id} row={row} onAnswered={refresh} />
          ))}
          {again.error && (
            <Alert tone="danger" live="alert">
              {messageOf(again.error)}
            </Alert>
          )}
          {allAnswered && (
            <Button onPress={() => again.mutate()} loading={again.isPending}>
              {t('resubmit')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function CorrectionRow({ row, onAnswered }: { row: ChangeRequest; onAnswered: () => void }) {
  const t = useTranslations('registration');
  const messageOf = useMessageOf();
  const field = row.field as RequestField;
  const label = t(FIELD_LABEL[field] ?? 'form.name');
  const [value, setValue] = useState<unknown>(undefined);
  const answer = useMutation({
    mutationFn: (newValue: unknown) => answerRequest(row.id, newValue),
    onSuccess: onAnswered,
  });
  const answered = row.status === 'submitted';
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!answer.isPending) answer.mutate(cleanValue(field, value));
  };
  return (
    <Card>
      <Form onSubmit={submit} aria-label={label}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <strong>{label}</strong>
            {answered && (
              <Badge tone="success" icon={CircleCheck} label={t('profile.corrections.answered')} />
            )}
          </div>
          {row.note && <p className="m-0">{t('profile.corrections.note', { note: row.note })}</p>}
          {isPhoto(field) ? (
            <PhotoField
              label={label}
              upload={(photo) => uploadOwnPhoto(row.id, field, photo)}
              onUploaded={(fileId) => fileId && answer.mutate(fileId)}
              error={messageOf(answer.error) ?? undefined}
            />
          ) : (
            <>
              <ValueEditor
                field={field}
                label={label}
                value={value}
                onChange={setValue}
                error={messageOf(answer.error) ?? undefined}
              />
              <Button type="submit" variant="secondary" loading={answer.isPending}>
                {t('profile.corrections.answer')}
              </Button>
            </>
          )}
        </div>
      </Form>
    </Card>
  );
}

/** An open edit beside its detail: the code a new contact waits for, or the photo to upload. */
export function RequestState({
  row,
  field,
  label,
}: {
  row: ChangeRequest;
  field: RequestField;
  label: string;
}) {
  const t = useTranslations('registration');
  const messageOf = useMessageOf();
  const refresh = useRefresh();
  const [code, setCode] = useState('');
  // each action clears the other's result, so an old message never hides a new one
  const send = useMutation({ mutationFn: () => sendContactCode(row.id) });
  const verify = useMutation({
    mutationFn: () => verifyContactCode(row.id, code),
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
    <div className="flex flex-col gap-3">
      <TextField
        label={t('profile.edit.code')}
        name={`code-${row.id}`}
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        helper={send.isSuccess ? t('profile.edit.code_sent') : undefined}
        error={messageOf(verify.error ?? send.error) ?? undefined}
        endAction={
          <Button
            size="sm"
            variant="secondary"
            onPress={() => {
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
          onPress={() => {
            send.reset();
            verify.mutate();
          }}
          loading={verify.isPending}
          disabled={code.length !== 6}
        >
          {t('profile.edit.verify_code')}
        </Button>
      </div>
    </div>
  );
}
