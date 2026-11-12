import type { FormDefinition, FormField } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { SelectField, Stack, Text } from '@/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { NumberText } from './NumberText';

/**
 * Two limits that belong together (a length, a value, a number of rows). A smallest that passes
 * the largest shows a message and is not kept, so the draft never holds limits nothing can meet.
 * The parent keys this by the question, so another question starts from its own limits.
 */
export function LimitPair({
  minLabel,
  maxLabel,
  min,
  max,
  integer = false,
  orderMessage,
  onApply,
}: {
  minLabel: string;
  maxLabel: string;
  min: number | undefined;
  max: number | undefined;
  integer?: boolean;
  orderMessage: string;
  onApply: (min: number | undefined, max: number | undefined) => void;
}) {
  const [pair, setPair] = useState({ min, max });
  const crossed = pair.min !== undefined && pair.max !== undefined && pair.min > pair.max;
  const set = (next: { min: number | undefined; max: number | undefined }) => {
    setPair(next);
    if (next.min === undefined || next.max === undefined || next.min <= next.max)
      onApply(next.min, next.max);
  };
  return (
    <Stack direction="row" gap={2} wrap>
      <NumberText
        label={minLabel}
        integer={integer}
        value={pair.min}
        onChange={(v) => set({ ...pair, min: v })}
      />
      <NumberText
        label={maxLabel}
        integer={integer}
        value={pair.max}
        error={crossed ? orderMessage : undefined}
        onChange={(v) => set({ ...pair, max: v })}
      />
    </Stack>
  );
}

/** A repeat group's smallest and largest number of rows, and the questions each row asks. */
export function RepeatSettings({
  definition,
  field,
  onRows,
  counts,
  onCountFrom,
}: {
  definition: FormDefinition;
  field: FormField;
  onRows: (min: number | undefined, max: number | undefined) => void;
  /** The earlier whole-number questions the rows may follow. */
  counts: FormField[];
  onCountFrom: (key: string | null) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const members = definition.sections
    .flatMap((s) => s.fields)
    .filter((f) => f.settings?.repeat?.group === field.fieldKey);
  const countFrom = field.settings?.repeat?.count_from ?? null;
  return (
    <Stack gap={2}>
      <SelectField
        label={t('count_from')}
        hint={t('count_from_hint')}
        value={countFrom ?? 'none'}
        onChange={(id) => onCountFrom(id && id !== 'none' ? id : null)}
        options={[
          { value: 'none', label: t('count_from_none') },
          ...counts.map((f) => ({ value: f.fieldKey, label: localized(f.label, locale) })),
        ]}
      />
      <LimitPair
        minLabel={t('min_rows')}
        maxLabel={t('max_rows')}
        integer
        min={field.settings?.repeat?.min_rows}
        max={field.settings?.repeat?.max_rows}
        orderMessage={t('rows_order')}
        onApply={onRows}
      />
      <Text>
        <strong>{t('members')}</strong>
      </Text>
      {members.length ? (
        <ul aria-label={t('members')} className="form-settings-list">
          {members.map((m) => (
            <li key={m.fieldKey}>{localized(m.label, locale)}</li>
          ))}
        </ul>
      ) : (
        <Text tone="muted">{t('members_none')}</Text>
      )}
      <Text tone="muted">{t('members_hint')}</Text>
    </Stack>
  );
}
