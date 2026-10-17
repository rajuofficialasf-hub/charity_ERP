import type { InvitationIssued } from '@css/shared/auth';
import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, Modal, TextField } from '@css/ui';
import { Copy } from 'lucide-react';
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
    <Modal
      title={t('title', { name })}
      isOpen
      onClose={onClose}
      primaryAction={<Button onPress={onClose}>{tc('close')}</Button>}
    >
      <Alert tone={issued.emailed ? 'success' : 'warning'} live="status">
        {issued.emailed ? t('emailed') : t('not_emailed')}
      </Alert>
      <TextField
        label={t('field')}
        helper={t('valid_until', { time: formatDateTime(issued.expiresAt, locale) })}
        value={issued.link}
        readOnly
        lang="en"
      />
      <div>
        <Button variant="secondary" icon={Copy} onPress={() => void copy()}>
          {t('copy')}
        </Button>
      </div>
      {copied && (
        <Alert tone={copied === 'yes' ? 'success' : 'warning'} live="status">
          {copied === 'yes' ? t('copied') : t('copy_failed')}
        </Alert>
      )}
      <p className="m-0">{t('once')}</p>
    </Modal>
  );
}
