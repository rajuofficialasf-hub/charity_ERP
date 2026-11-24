import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button, DescriptionList, Drawer } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { AuditEntry } from './audit-api';

/** What changed between the two snapshots: items added to or taken from a list, and fields changed. */
export interface AuditChange {
  field: string | null;
  added: string[];
  removed: string[];
  changed: { from: string; to: string } | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** The difference of two lists, by each item's text. */
function listChange(field: string | null, before: unknown[], after: unknown[]): AuditChange | null {
  const was = new Set(before.map(text));
  const now = new Set(after.map(text));
  const added = [...now].filter((v) => !was.has(v));
  const removed = [...was].filter((v) => !now.has(v));
  return added.length || removed.length ? { field, added, removed, changed: null } : null;
}

/**
 * The changes of an entry, read from its old and new values: a list compared item by item, an
 * object field by field (a list inside it item by item again), anything else as before and after.
 */
export function changesOf(before: unknown, after: unknown): AuditChange[] {
  if (Array.isArray(before) && Array.isArray(after))
    return [listChange(null, before, after)].filter((c): c is AuditChange => c !== null);
  const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (isObject(before) && isObject(after)) {
    const out: AuditChange[] = [];
    const wasOf = new Map(Object.entries(before));
    const nowOf = new Map(Object.entries(after));
    for (const field of new Set([...wasOf.keys(), ...nowOf.keys()])) {
      const was = wasOf.get(field);
      const now = nowOf.get(field);
      if (Array.isArray(was) && Array.isArray(now)) {
        const change = listChange(field, was, now);
        if (change) out.push(change);
      } else if (text(was) !== text(now))
        out.push({
          field,
          added: [],
          removed: [],
          changed: {
            from: was === undefined ? '' : text(was),
            to: now === undefined ? '' : text(now),
          },
        });
    }
    return out;
  }
  return [];
}

/** The changes of an entry in short lines: what was added, taken away or changed. */
function Changes({ entry }: { entry: AuditEntry }) {
  const t = useTranslations('admin.audit.detail');
  const changes = changesOf(entry.old, entry.new);
  if (!changes.length) return null;
  return (
    <section className="admin-audit-changes" aria-label={t('changes')}>
      <h3 className="admin-audit-side-title">{t('changes')}</h3>
      <ul className="admin-plain-list">
        {changes.map((c, i) => (
          <li key={`${c.field ?? ''}-${i}`} className="admin-plain-item" lang="en">
            {c.field ? <strong>{c.field}</strong> : null}
            {c.added.length ? <span>{t('added', { items: c.added.join(', ') })}</span> : null}
            {c.removed.length ? <span>{t('removed', { items: c.removed.join(', ') })}</span> : null}
            {c.changed ? (
              <span>{t('changed', { from: c.changed.from || '—', to: c.changed.to || '—' })}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    // who or what it is about, by name where the log names it
    [
      t('entity'),
      entry.entityName
        ? `${entry.entityName} (${entry.entityType})`
        : entry.entityId
          ? `${entry.entityType} · ${entry.entityId}`
          : entry.entityType,
    ],
    [t('reason'), entry.reason ?? '—'],
    [t('ip'), entry.ip ?? '—'],
    [t('device'), entry.deviceSessionId ?? '—'],
  ];
  return (
    <Drawer
      title={t('title')}
      open
      onClose={onClose}
      actions={
        entry.entityId ? (
          <Button
            variant="secondary"
            startIcon="history"
            onClick={() => onHistory(entry.entityType, entry.entityId!)}
          >
            {t('history')}
          </Button>
        ) : undefined
      }
    >
      <div className="admin-audit-facts">
        <DescriptionList items={facts.map(([label, value]) => ({ label, value }))} />
      </div>
      <Changes entry={entry} />
      <div className="admin-audit-compare">
        <Snapshot label={t('old')} value={entry.old} />
        <Snapshot label={t('new')} value={entry.new} />
      </div>
    </Drawer>
  );
}
