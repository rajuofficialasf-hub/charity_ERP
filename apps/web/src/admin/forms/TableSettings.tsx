import type { NumberTable } from '@css/shared/forms';
import { Button, Stack, Text, TextField } from '@css/ui';
import { Plus } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { RowButtons } from './RowButtons';

type Line = NumberTable['rows'][number];

/**
 * The rows and columns of a number table (cows, goats; own, sharecropped), each with its label in
 * both languages. Keys are made for new lines (r1, c1, …) and never shown; a table keeps at least
 * one row and one column.
 */
export function TableSettings({
  table,
  onChange,
}: {
  table: NumberTable;
  onChange: (table: NumberTable) => void;
}) {
  const t = useTranslations('forms.builder');
  const list = (which: 'rows' | 'cols') => {
    const lines = table[which];
    const prefix = which === 'rows' ? 'r' : 'c';
    const set = (next: Line[]) => onChange({ ...table, [which]: next });
    const freeKey = () => {
      const used = new Set(lines.map((l) => l.key));
      let n = lines.length + 1;
      while (used.has(`${prefix}${n}`)) n += 1;
      return `${prefix}${n}`;
    };
    return (
      <Stack gap={2} role="group" aria-label={t(which === 'rows' ? 'table_rows' : 'table_cols')}>
        <Text weight="bold">{t(which === 'rows' ? 'table_rows' : 'table_cols')}</Text>
        {lines.map((line, i) => {
          const n = String(i + 1);
          const name = t(which === 'rows' ? 'table_row' : 'table_col', { n });
          return (
            <Stack key={line.key} gap={1} className="form-settings-row">
              <TextField
                label={t('table_label_bn', { name })}
                value={line.label.bn}
                onChange={(bn) =>
                  set(lines.map((l, j) => (j === i ? { ...l, label: { ...l.label, bn } } : l)))
                }
              />
              <TextField
                label={t('table_label_en', { name })}
                lang="en"
                value={line.label.en}
                onChange={(en) =>
                  set(lines.map((l, j) => (j === i ? { ...l, label: { ...l.label, en } } : l)))
                }
              />
              {lines.length > 1 ? (
                <RowButtons
                  remove={{
                    label: t('table_remove', { name }),
                    onPress: () => set(lines.filter((_, j) => j !== i)),
                  }}
                />
              ) : null}
            </Stack>
          );
        })}
        <div>
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onPress={() => {
              const n = String(lines.length + 1);
              const name = t(which === 'rows' ? 'table_row' : 'table_col', { n });
              set([...lines, { key: freeKey(), label: { bn: name, en: name } }]);
            }}
          >
            {t(which === 'rows' ? 'table_add_row' : 'table_add_col')}
          </Button>
        </div>
      </Stack>
    );
  };
  return (
    <Stack gap={3}>
      {list('rows')}
      {list('cols')}
    </Stack>
  );
}

/** The table a new number table starts with: one row and one column, named in the catalogue. */
export function startTable(row: string, col: string): NumberTable {
  return {
    rows: [{ key: 'r1', label: { bn: row, en: row } }],
    cols: [{ key: 'c1', label: { bn: col, en: col } }],
  };
}
