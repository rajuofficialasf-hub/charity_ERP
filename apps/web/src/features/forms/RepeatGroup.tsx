import { formatCount } from '@css/shared/format';
import type { FormField } from '@css/shared/forms';
import { Button, Stack, Text } from '@/ui';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { QuestionTitle } from './QuestionTitle';

/**
 * A repeat group ("+ add another"): its rows, each with the member questions, between the group's
 * minimum and maximum. The first rows down to the minimum have no remove button.
 */
export function RepeatGroup({
  group,
  rows,
  renderRow,
  onAdd,
  onRemove,
  counted = false,
}: {
  group: FormField;
  rows: number;
  renderRow: (row: number) => ReactNode;
  onAdd: () => void;
  onRemove: (row: number) => void;
  /** The rows follow a count question, so they are neither added nor removed here. */
  counted?: boolean;
}) {
  const t = useTranslations('forms.renderer');
  const locale = useLocale();
  const label = group.label[locale];
  const min = group.settings?.repeat?.min_rows ?? 0;
  const max = group.settings?.repeat?.max_rows;
  return (
    <section aria-label={label}>
      <Stack gap={2}>
        <QuestionTitle>{label}</QuestionTitle>
        {Array.from({ length: rows }, (_, row) => (
          // rows are positions: removing one moves the answers after it up, so the position is the key
          <Stack key={row} gap={2}>
            <QuestionTitle>
              {t('row_title', { label, n: formatCount(row + 1, locale) })}
            </QuestionTitle>
            {renderRow(row)}
            {!counted && rows > min ? (
              <div>
                <Button variant="text" size="small" onClick={() => onRemove(row)}>
                  {t('remove_row', { label, n: formatCount(row + 1, locale) })}
                </Button>
              </div>
            ) : null}
          </Stack>
        ))}
        {counted ? null : (
          <div>
            <Button variant="secondary" onClick={onAdd} disabled={max !== undefined && rows >= max}>
              {t('add_row')}
            </Button>
          </div>
        )}
        {!counted && max !== undefined ? (
          <Text tone="muted">{t('rows_limit', { max: formatCount(max, locale) })}</Text>
        ) : null}
      </Stack>
    </section>
  );
}
