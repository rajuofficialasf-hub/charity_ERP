import type { AnswerValue } from '@css/shared';
import type { FormField } from '@css/shared/forms';
import { Alert, Grid, Stack, Text, TextField } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';

type Cells = Record<string, Record<string, number>>;

/**
 * A number table: one row of whole-number boxes per row of the question (cows, goats), one box per
 * column (own, sharecropped). Each box is named by its row and column; an empty box is no answer.
 */
export function NumberTableInput({
  field,
  name,
  label,
  help,
  required,
  error,
  locked,
  value,
  onChange,
}: {
  field: FormField;
  name: string;
  label: string;
  help?: string;
  required: boolean;
  error?: string;
  locked: boolean;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue | null) => void;
}) {
  const t = useTranslations('forms.renderer');
  const locale = useLocale();
  const rows = field.settings?.table?.rows ?? [];
  const cols = field.settings?.table?.cols ?? [];
  const cells: Cells = value?.t === 'number_table' ? value.v : {};
  const read = (row: string, col: string) => {
    const n = new Map(Object.entries(new Map(Object.entries(cells)).get(row) ?? {})).get(col);
    return n === undefined ? '' : String(n);
  };
  const set = (row: string, col: string, typed: string) => {
    const next = new Map(Object.entries(cells).map(([k, v]) => [k, new Map(Object.entries(v))]));
    const line = next.get(row) ?? new Map<string, number>();
    const n = Number(typed.trim());
    if (typed.trim() === '' || !Number.isInteger(n)) line.delete(col);
    else line.set(col, n);
    if (line.size) next.set(row, line);
    else next.delete(row);
    onChange(
      next.size
        ? {
            t: 'number_table',
            v: Object.fromEntries([...next].map(([k, v]) => [k, Object.fromEntries(v)])),
          }
        : null,
    );
  };
  const columns = Math.min(Math.max(cols.length, 1), 3) as 1 | 2 | 3;
  return (
    <div role="group" aria-label={label}>
      <Stack gap={2}>
        <Text>
          <strong>
            {label}
            {required ? ` ${t('required_mark')}` : ''}
          </strong>
        </Text>
        {help ? <Text tone="muted">{help}</Text> : null}
        {rows.map((row) => (
          <Stack key={row.key} gap={1}>
            <Text>{row.label[locale]}</Text>
            <Grid columns={{ base: 1, sm: columns }} gap={2}>
              {cols.map((col) => (
                <TextField
                  key={col.key}
                  type="integer"
                  label={t('table_cell', { row: row.label[locale], col: col.label[locale] })}
                  name={`${name}-${row.key}-${col.key}`}
                  value={read(row.key, col.key)}
                  locked={locked}
                  onChange={(typed) => set(row.key, col.key, typed)}
                />
              ))}
            </Grid>
          </Stack>
        ))}
        {error ? <Alert tone="error">{error}</Alert> : null}
      </Stack>
    </div>
  );
}
