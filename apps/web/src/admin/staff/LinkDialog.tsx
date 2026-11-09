import type { InvitationIssued } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Dialog, Text, TextField } from '@/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';

/**
 * The set-password link of a new official, shown once (DECISION_LOG D-097): whether the email went
 * out, the link itself to copy for WhatsApp or another way, and until when it works. The page
 * keeps no copy of it; a lost link is replaced by a new one.
 */
export function LinkDialog({
  name,
  issued,
  onClose,
}: {
  name: string;
  issued: InvitationIssued;
  onClose: () => void;
}) {
  const t = useTranslations('admin.staff.link');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const [copied, setCopied] = useState<'yes' | 'no'>();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied('yes');
    } catch {
      // no clipboard (an old browser or a denied permission): the field stays selectable
      setCopied('no');
    }
  };
  return (
    <Dialog
      title={t('title', { name })}
      open
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{tc('close')}</Button>
        </>
      }
    >
      <Alert tone={issued.emailed ? 'success' : 'warning'}>
        {issued.emailed ? t('emailed') : t('not_emailed')}
      </Alert>
      <TextField
        label={t('field')}
        hint={t('valid_until', { time: formatDateTime(issued.expiresAt, locale) })}
        value={issued.link}
        onChange={() => undefined}
        readOnly
        lang="en"
      />
      <div>
        <Button variant="secondary" startIcon="copy" onClick={() => void copy()}>
          {t('copy')}
        </Button>
      </div>
      {copied && (
        <Alert tone={copied === 'yes' ? 'success' : 'warning'}>
          {copied === 'yes' ? t('copied') : t('copy_failed')}
        </Alert>
      )}
      <Text>{t('once')}</Text>
    </Dialog>
  );
}
