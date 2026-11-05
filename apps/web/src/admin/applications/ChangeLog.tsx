import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { FormDefinition } from '@css/shared/forms';
import { Text } from '@/ui';
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
 * unlock changed later, each with the old and the new value and the time. The office reads it;
 * a volunteer never does.
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
      <caption className="ui-sr-only">{t('title')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('field')}</th>
          <th scope="col">{t('old')}</th>
          <th scope="col">{t('new')}</th>
          <th scope="col">{t('when')}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.id}>
            <th scope="row">{labels.get(c.field.replace(/\[\d+\]$/, '')) ?? c.field}</th>
            <td>{shown(c.oldValue, t('none'))}</td>
            <td>{shown(c.newValue, t('none'))}</td>
            <td>{formatDateTime(c.createdAt, locale)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
