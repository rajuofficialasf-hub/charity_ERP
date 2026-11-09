import { toEnglishDigits } from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import { NISAB_MAX_DAYS_AHEAD, type NisabVersionView } from '@css/shared/settings';
import { Alert, Button, DateField, Dialog, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { addNisab } from './nisab-api';

const DAY = 86_400_000;

/**
 * Adds a nisab version: an amount in Taka and an effective date from today (Dhaka) to a year
 * ahead, after the latest version; a version is never edited afterwards.
 */
export function NisabDialog({
  latest,
  onClose,
  onDone,
}: {
  /** The latest version not withdrawn, whose date the new one must follow. */
  latest?: NisabVersionView;
  onClose: () => void;
  onDone: (version: NisabVersionView) => void;
}) {
  const t = useTranslations('admin.nisab.dialog');
  const tc = useTranslations('common.action');
  // the day the dialog opened fixes today and the latest allowed date
  const [{ today, latestAllowed }] = useState(() => {
    const now = Date.now();
    return {
      today: isoDateInDhaka(new Date(now)),
      latestAllowed: isoDateInDhaka(new Date(now + NISAB_MAX_DAYS_AHEAD * DAY)),
    };
  });
  const [value, setValue] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () =>
      addNisab({
        value: value.trim(),
        effectiveFrom: date!,
        ...(note.trim() ? { basisNote: note.trim() } : {}),
      }),
    onSuccess: onDone,
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const detail = (path: string) => failure?.details.find((d) => d.path === path)?.message;
  const earliest =
    latest && latest.effectiveFrom >= today
      ? isoDateInDhaka(new Date(Date.parse(`${latest.effectiveFrom}T12:00:00Z`) + DAY))
      : today;
  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!value || !date} loading={save.isPending}>
            {tc('save')}
          </Button>
        </>
      }
    >
      <p className="admin-muted">{t('hint')}</p>
      {failure && !failure.details.length && <Alert tone="error">{failure.message}</Alert>}
      <TextField
        label={t('value')}
        hint={t('value_hint')}
        required
        inputMode="numeric"
        maxLength={15}
        value={value}
        onChange={(v) => setValue(toEnglishDigits(v).replace(/[^0-9.]/g, ''))}
        error={detail('value')}
      />
      <DateField
        label={t('effective_from')}
        hint={t('effective_hint')}
        required
        min={earliest}
        max={latestAllowed}
        value={date ?? ''}
        onChange={(iso) => setDate(iso || null)}
        error={detail('effectiveFrom')}
      />
      <TextField
        label={t('basis')}
        hint={t('basis_hint')}
        maxLength={500}
        value={note}
        onChange={setNote}
        error={detail('basisNote')}
      />
    </Dialog>
  );
}
