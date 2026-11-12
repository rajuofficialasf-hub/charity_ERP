import { type NumberTable, TABLE_CELLS_MAX } from '@css/shared/forms';
import { Button, Stack, Text, TextField } from '@/ui';
import { useTranslations } from 'use-intl';
import { RowButtons } from './RowButtons';
import { TYPED, type Typed } from './use-draft-history';

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
  /** `how` says a text was typed, so the history joins it to the typing just before it. */
  onChange: (table: NumberTable, how?: Typed) => void;
}) {
  const t = useTranslations('forms.builder');
  const list = (which: 'rows' | 'cols') => {
    const lines = table[which];
    const prefix = which === 'rows' ? 'r' : 'c';
    const set = (next: Line[], how?: Typed) => onChange({ ...table, [which]: next }, how);
    // one line more must stay within the cells a table may hold
    const full =
      (table.rows.length + (which === 'rows' ? 1 : 0)) *
        (table.cols.length + (which === 'cols' ? 1 : 0)) >
      TABLE_CELLS_MAX;
    const freeKey = () => {
      const used = new Set(lines.map((l) => l.key));
      let n = lines.length + 1;
      while (used.has(`${prefix}${n}`)) n += 1;
      return `${prefix}${n}`;
    };
    return (
      <div role="group" aria-label={t(which === 'rows' ? 'table_rows' : 'table_cols')}>
        <Stack gap={2}>
          <Text>
            <strong>{t(which === 'rows' ? 'table_rows' : 'table_cols')}</strong>
          </Text>
          {lines.map((line, i) => {
            const n = String(i + 1);
            const name = t(which === 'rows' ? 'table_row' : 'table_col', { n });
            return (
              <div key={line.key} className="form-settings-row">
                <Stack gap={1}>
                  <TextField
                    label={t('table_label_bn', { name })}
                    value={line.label.bn}
                    onChange={(bn) =>
                      set(
                        lines.map((l, j) => (j === i ? { ...l, label: { ...l.label, bn } } : l)),
                        TYPED,
                      )
                    }
                  />
                  <TextField
                    label={t('table_label_en', { name })}
                    lang="en"
                    value={line.label.en}
                    onChange={(en) =>
                      set(
                        lines.map((l, j) => (j === i ? { ...l, label: { ...l.label, en } } : l)),
                        TYPED,
                      )
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
              </div>
            );
          })}
          <div>
            <Button
              size="small"
              variant="secondary"
              startIcon="add"
              disabled={full}
              onClick={() => {
                const n = String(lines.length + 1);
                const name = t(which === 'rows' ? 'table_row' : 'table_col', { n });
                set([...lines, { key: freeKey(), label: { bn: name, en: name } }]);
              }}
            >
              {t(which === 'rows' ? 'table_add_row' : 'table_add_col')}
            </Button>
          </div>
          {full ? <Text tone="muted">{t('table_full', { max: TABLE_CELLS_MAX })}</Text> : null}
        </Stack>
      </div>
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
