import { formatDateTime } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Card, LinkButton, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { OverviewRecord } from '../../offline/applications-store';
import { SyncBadge } from '../applications/SyncBadge';

/**
 * One record of the sync centre: the person it is about, what kind of record and of which
 * project, its state, the reason of a refusal, and the actions the person may take on it.
 */
export function RecordRow({
  record,
  reason,
  note,
  busy,
  onRetry,
  onDelete,
}: {
  record: OverviewRecord;
  /** The words of the refusal, for a record that could not be sent. */
  reason: string | null;
  /** The words of what the office is checking. */
  note: string | null;
  busy: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations('sync.centre');
  const locale = useLocale() as Locale;
  const kind = t(`kind.${record.kind}`);
  const project = record.projectName ? localized(record.projectName, locale) : null;
  return (
    <li>
      <Card title={record.beneficiaryName ?? t('unnamed')} headingLevel={3}>
        <div className="sync-record">
          <Text tone="muted" size="small">
            {project ? `${kind} · ${project}` : kind}
          </Text>
          <div className="sync-record-meta">
            <SyncBadge sync={record.sync} />
            <span>{t('saved_at', { time: formatDateTime(record.createdAt, locale) })}</span>
          </div>
          {reason && <p className="sync-record-reason">{reason}</p>}
          {note && <p className="sync-record-note">{note}</p>}
          <div className="sync-record-actions">
            {onRetry && (
              <Button size="small" loading={busy} onClick={onRetry}>
                {t('retry')}
              </Button>
            )}
            <LinkButton
              variant="secondary"
              to={record.ownDraft ? `${record.href}/edit` : record.href}
            >
              {record.ownDraft ? t('edit') : t('open')}
            </LinkButton>
            {onDelete && (
              <Button size="small" variant="text" onClick={onDelete}>
                {t('delete')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
