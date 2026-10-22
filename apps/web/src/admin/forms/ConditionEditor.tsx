import type { Condition, ConditionOp } from '@css/shared';
import type { FormDefinition, FormField } from '@css/shared/forms';
import {
  Alert,
  Button,
  CheckboxGroup,
  DateField,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextField,
} from '@css/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { type Asker, conditionCandidates, OPS, opKindOf } from './candidates';
import { type ConditionRow, conditionFromRows, rowsFromCondition } from './logic-rows';
import { NumberText } from './NumberText';

/**
 * "Show when" or "required when" as rows (a question, a comparison and a value) joined by "all of
 * these" or "any of these", one level deep. A condition the rows cannot show (from the seed or an
 * earlier version) is shown with a note and can only be removed and written again.
 */
export function ConditionEditor({
  title,
  definition,
  asker,
  condition,
  onChange,
}: {
  title: string;
  definition: FormDefinition;
  asker: Asker;
  condition: Condition | null | undefined;
  onChange: (condition: Condition | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const view = rowsFromCondition(condition);
  const candidates = conditionCandidates(definition, asker);
  const byKey = new Map(candidates.map((f) => [f.fieldKey, f]));

  if (view.kind === 'complex')
    return (
      <Stack as="section" gap={2} aria-label={title}>
        <Text weight="bold">{title}</Text>
        <Alert tone="info">{t('cond_complex')}</Alert>
        <Button size="sm" variant="secondary" icon={Trash2} onPress={() => onChange(undefined)}>
          {t('cond_clear')}
        </Button>
      </Stack>
    );

  const { join, rows } = view;
  const write = (next: ConditionRow[], nextJoin = join) =>
    onChange(conditionFromRows({ join: nextJoin, rows: next }));
  const setRow = (index: number, row: ConditionRow) =>
    write(rows.map((r, i) => (i === index ? row : r)));
  const fresh = (field: FormField): ConditionRow => ({
    field: field.fieldKey,
    op: OPS[opKindOf(field)][0]!,
  });

  return (
    <Stack as="section" gap={2} aria-label={title}>
      <Text weight="bold">{title}</Text>
      {rows.length === 0 ? <Text tone="muted">{t('cond_hint')}</Text> : null}
      {rows.length > 1 ? (
        <SegmentedControl
          label={t('cond_join')}
          value={join}
          onChange={(id) => write(rows, id === 'any' ? 'any' : 'all')}
          options={[
            { id: 'all', label: t('cond_all') },
            { id: 'any', label: t('cond_any') },
          ]}
        />
      ) : null}
      {rows.map((row, i) => {
        const n = String(i + 1);
        const field = byKey.get(row.field);
        const ops = field ? OPS[opKindOf(field)] : OPS.text;
        return (
          <Stack key={i} gap={1} className="form-settings-row">
            <Select
              label={t('cond_field', { n })}
              value={field ? row.field : null}
              onChange={(id) => {
                const next = id ? byKey.get(id) : undefined;
                if (next) setRow(i, fresh(next));
              }}
              options={candidates.map((f) => ({ id: f.fieldKey, label: f.label[locale] }))}
            />
            <Select
              label={t('cond_op', { n })}
              value={row.op}
              onChange={(id) => {
                const op = ops.find((o) => o === id);
                if (!op) return;
                // a list comparison takes a list, the others one value; an emptiness check none
                const listChange = (op === 'in' || op === 'not_in') !== Array.isArray(row.value);
                setRow(i, {
                  field: row.field,
                  op,
                  ...(op === 'is_empty' || op === 'not_empty' || listChange
                    ? {}
                    : row.value !== undefined
                      ? { value: row.value }
                      : {}),
                });
              }}
              options={ops.map((op) => ({ id: op, label: t(`ops.${op}`) }))}
            />
            {field ? (
              <ValueInput
                label={t('cond_value', { n })}
                field={field}
                op={row.op}
                value={row.value}
                onChange={(value) =>
                  setRow(i, {
                    field: row.field,
                    op: row.op,
                    ...(value === undefined ? {} : { value }),
                  })
                }
              />
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              iconOnly
              onPress={() => write(rows.filter((_, j) => j !== i))}
            >
              {t('cond_remove', { n })}
            </Button>
          </Stack>
        );
      })}
      <Button
        size="sm"
        variant="secondary"
        icon={Plus}
        disabled={candidates.length === 0}
        onPress={() => write([...rows, fresh(candidates[0]!)])}
      >
        {t('cond_add')}
      </Button>
    </Stack>
  );
}

/** The value a row compares with, in the shape the question's answer has. */
function ValueInput({
  label,
  field,
  op,
  value,
  onChange,
}: {
  label: string;
  field: FormField;
  op: ConditionOp;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const locale = useLocale();
  if (op === 'is_empty' || op === 'not_empty') return null;
  const kind = opKindOf(field);
  if (kind === 'choice') {
    const options = (field.options ?? []).map((o) => ({ id: o.code, label: o.label[locale] }));
    if (op === 'in' || op === 'not_in')
      return (
        <CheckboxGroup
          label={label}
          options={options}
          value={Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []}
          onChange={(ids) => onChange(ids.length ? ids : undefined)}
        />
      );
    return (
      <Select
        label={label}
        value={typeof value === 'string' ? value : null}
        onChange={(id) => onChange(id ?? undefined)}
        options={options}
      />
    );
  }
  if (kind === 'number')
    return (
      <NumberText
        label={label}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
      />
    );
  if (kind === 'date')
    return (
      <DateField
        label={label}
        value={typeof value === 'string' ? value : null}
        onChange={(iso) => onChange(iso ?? undefined)}
      />
    );
  return (
    <TextField
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={(text) => onChange(text === '' ? undefined : text)}
    />
  );
}
