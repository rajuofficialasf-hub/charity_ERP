import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { FormDefinition } from '@css/shared/forms';
import { Chip, Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import type { FieldChange } from './applications-api';

/** A stored value as short text: a plain value, a list, or the engine's own shape. */
function shown(value: unknown, none: string): string {
  if (value === null || value === undefined) return none;
  if (typeof value === 'object' && value !== null && 'v' in value) {
    const v = (value as { v: unknown }).v;
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * The change log of the answers: what the office changed during the review and what a field
 * unlock changed later, each with the old and the new value, the time, and who and why: who made
 * the change, or for an unlock who opened it and why, who gave the new answer and who accepted it,
 * sent it back with the reason or cancelled it. A value sent back is marked so, since the answer
 * kept its old value. The office reads it; a volunteer never does.
 */
export function ChangeLog({ changes, form }: { changes: FieldChange[]; form: FormDefinition }) {
  const t = useTranslations('applications.office.changes');
  const locale = useLocale() as Locale;
  const labels = new Map(
    form.sections.flatMap((s) => s.fields.map((f) => [f.fieldKey, f.label[locale]] as const)),
  );
  if (!changes.length) return <Text tone="muted">{t('empty')}</Text>;
  return (
    <table className="admin-change-log">
      <caption className="app-sr-only">{t('title')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('field')}</th>
          <th scope="col">{t('old')}</th>
          <th scope="col">{t('new')}</th>
          <th scope="col">{t('when')}</th>
          <th scope="col">{t('who')}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.id}>
            <th scope="row">{labels.get(c.field.replace(/\[\d+\]$/, '')) ?? c.field}</th>
            <td>{shown(c.oldValue, t('none'))}</td>
            <td>
              {shown(c.newValue, t('none'))}
              {c.decision === 'refused' ? <Chip tone="warning">{t('returned')}</Chip> : null}
            </td>
            <td>{formatDateTime(c.createdAt, locale)}</td>
            <td>
              {whoAndWhy(c, t).map((line) => (
                <Text key={line} size="small">
                  {line}
                </Text>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The lines of who and why of one change, each only where it is known. */
function whoAndWhy(
  c: FieldChange,
  t: ReturnType<typeof useTranslations<'applications.office.changes'>>,
): string[] {
  if (c.kind !== 'unlock')
    return c.changedByName ? [t('changed_by', { name: c.changedByName })] : [];
  const decided = c.decidedByName
    ? {
        accepted: t('accepted_by', { name: c.decidedByName }),
        refused: t('returned_by', { name: c.decidedByName }),
        cancelled: t('cancelled_by', { name: c.decidedByName }),
      }[c.decision ?? 'accepted']
    : null;
  return [
    ...(c.requestedByName ? [t('opened_by', { name: c.requestedByName })] : []),
    ...(c.reason ? [t('opened_reason', { reason: c.reason })] : []),
    ...(c.enteredByName ? [t('entered_by', { name: c.enteredByName })] : []),
    ...(decided && c.decision ? [decided] : []),
    ...(c.decision === 'refused' && c.decisionReason
      ? [t('returned_reason', { reason: c.decisionReason })]
      : []),
  ];
}
