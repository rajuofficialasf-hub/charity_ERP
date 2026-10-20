import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button, Drawer } from '@css/ui';
import { History } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import type { AuditEntry } from './audit-api';

/** A snapshot as readable text; nothing when the entry has no value on that side. */
function Snapshot({ label, value }: { label: string; value: unknown }) {
  const t = useTranslations('admin.audit.detail');
  return (
    <section className="admin-audit-side" aria-label={label}>
      <h3 className="admin-audit-side-title">{label}</h3>
      {value === null || value === undefined ? (
        <p className="admin-muted">{t('nothing')}</p>
      ) : (
        <pre className="admin-audit-json" lang="en">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
  );
}

/**
 * One audit entry: when, who in which role, what on which entity, the reason, the address and the
 * device session, and the old and the new values side by side; the whole history of the entity is
 * one press away.
 */
export function AuditDetail({
  entry,
  onClose,
  onHistory,
}: {
  entry: AuditEntry;
  onClose: () => void;
  onHistory: (entityType: string, entityId: string) => void;
}) {
  const t = useTranslations('admin.audit.detail');
  const locale = useLocale() as Locale;
  const facts: [string, string][] = [
    [t('time'), formatDateTime(entry.createdAt, locale)],
    [t('actor'), entry.actor ? entry.actor.name : t('system')],
    [t('role'), entry.actorRole ?? '—'],
    [t('action'), entry.action],
    [t('entity'), entry.entityId ? `${entry.entityType} · ${entry.entityId}` : entry.entityType],
    [t('reason'), entry.reason ?? '—'],
    [t('ip'), entry.ip ?? '—'],
    [t('device'), entry.deviceSessionId ?? '—'],
  ];
  return (
    <Drawer
      title={t('title')}
      isOpen
      onClose={onClose}
      footer={
        entry.entityId ? (
          <Button
            variant="secondary"
            icon={History}
            onPress={() => onHistory(entry.entityType, entry.entityId!)}
          >
            {t('history')}
          </Button>
        ) : undefined
      }
    >
      <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="font-bold">{label}</dt>
            <dd className="m-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="admin-audit-compare">
        <Snapshot label={t('old')} value={entry.old} />
        <Snapshot label={t('new')} value={entry.new} />
      </div>
    </Drawer>
  );
}
