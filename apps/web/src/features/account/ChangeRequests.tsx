import { EDIT_FIELDS, type PhotoSlot } from '@css/shared/registration';
import { Alert, Badge, Button, Card, Form, Select, TextField } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { PhotoField } from '../registration/PhotoField';
import {
  answerRequest,
  askEdit,
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

const isPhoto = (field: string): field is PhotoSlot => field === 'photo' || field === 'nid_photo';
const isContact = (field: string) => field === 'mobile' || field === 'email';

/** The message of a refused call: the field message of a 422, else the API's own message. */
function messageOf(error: unknown): string | null {
  if (!(error instanceof ApiFailure)) return null;
  return error.details[0]?.message ?? error.message;
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
    answer.mutate(cleanValue(field, value));
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

/**
 * Edit requests of an approved volunteer (BR-031 as amended by D-085): the new value goes with
 * the request; a new mobile or email first needs its code, a photo its upload.
 */
export function EditRequests({ requests }: { requests: ChangeRequest[] }) {
  const t = useTranslations('registration');
  const refresh = useRefresh();
  const [field, setField] = useState<RequestField | null>(null);
  const [value, setValue] = useState<unknown>(undefined);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const ask = useMutation({
    mutationFn: () =>
      askEdit({
        field: field!,
        ...(field && !isPhoto(field) ? { newValue: cleanValue(field, value) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      setSent(true);
      setValue(undefined);
      setNote('');
      refresh();
    },
  });
  const open = requests.filter((r) => r.kind === 'profile_edit');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(false);
    ask.mutate();
  };

  return (
    <section aria-labelledby="edit-title" className="flex flex-col gap-4">
      <h2 id="edit-title">{t('profile.edit.title')}</h2>
      <p className="m-0">{t('profile.edit.intro')}</p>
      {open.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3>{t('profile.edit.open')}</h3>
          {open.map((row) => (
            <OpenEdit key={row.id} row={row} onChanged={refresh} />
          ))}
        </div>
      )}
      <Form onSubmit={submit} aria-label={t('profile.edit.title')}>
        <div className="flex flex-col gap-3">
          <Select
            label={t('profile.edit.field')}
            name="field"
            required
            value={field}
            onChange={(id) => {
              setField(id as RequestField | null);
              setValue(undefined);
            }}
            options={EDIT_FIELDS.map((f) => ({ id: f, label: t(FIELD_LABEL[f]) }))}
          />
          {field && !isPhoto(field) && (
            <ValueEditor
              field={field}
              label={t('profile.edit.new_value')}
              value={value}
              onChange={setValue}
            />
          )}
          {field && isContact(field) && <p className="m-0">{t('profile.edit.code_intro')}</p>}
          {field && isPhoto(field) && <p className="m-0">{t('profile.edit.photo_intro')}</p>}
          <TextField label={t('profile.edit.note')} name="note" value={note} onChange={setNote} />
          {sent && (
            <Alert tone="success" live="status">
              {t('profile.edit.sent')}
            </Alert>
          )}
          {ask.error && (
            <Alert tone="danger" live="alert">
              {messageOf(ask.error)}
            </Alert>
          )}
          <Button type="submit" loading={ask.isPending} disabled={!field}>
            {t('profile.edit.send')}
          </Button>
        </div>
      </Form>
    </section>
  );
}

/** One open edit: its status, and the code or the photo it still waits for. */
function OpenEdit({ row, onChanged }: { row: ChangeRequest; onChanged: () => void }) {
  const t = useTranslations('registration');
  const field = row.field as RequestField;
  const label = t(FIELD_LABEL[field] ?? 'form.name');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const send = useMutation({
    mutationFn: () => sendContactCode(row.id),
    onSuccess: () => setCodeSent(true),
  });
  const verify = useMutation({
    mutationFn: () => verifyContactCode(row.id, code),
    onSuccess: onChanged,
  });
  const waiting = row.status === 'open';
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <strong>{label}</strong>
          <Badge
            tone={waiting ? 'warning' : 'info'}
            icon={Clock}
            label={t(waiting ? 'profile.edit.status.open' : 'profile.edit.status.submitted')}
          />
        </div>
        {waiting && isContact(field) && (
          <>
            <Button variant="secondary" onPress={() => send.mutate()} loading={send.isPending}>
              {t('profile.edit.send_code')}
            </Button>
            {codeSent && (
              <Alert tone="info" live="status">
                {t('profile.edit.code_sent')}
              </Alert>
            )}
            <TextField
              label={t('profile.edit.code')}
              name={`code-${row.id}`}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              error={messageOf(verify.error ?? send.error) ?? undefined}
            />
            <Button onPress={() => verify.mutate()} loading={verify.isPending}>
              {t('profile.edit.verify_code')}
            </Button>
          </>
        )}
        {waiting && isPhoto(field) && (
          <PhotoField
            label={label}
            upload={(photo) => uploadOwnPhoto(row.id, field, photo)}
            onUploaded={(fileId) => fileId && onChanged()}
          />
        )}
      </div>
    </Card>
  );
}
