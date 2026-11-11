import { type Condition, type ConditionOp, isFieldRef } from '@css/shared';
import type { FormDefinition, FormField } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  CheckboxGroup,
  DateField,
  SelectField,
  Stack,
  Text,
  TextField,
  RadioGroup,
} from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { type Asker, conditionCandidates, OPS, opKindOf } from './candidates';
import { type ConditionRow, conditionFromRows, rowsFromCondition } from './logic-rows';
import { NumberText } from './NumberText';
import { TYPED, type Typed } from './use-draft-history';
import { RowButtons } from './RowButtons';
import { useRowKeys } from '../../lib/use-row-keys';

/**
 * "Show when" or "required when" as rows (a question, a comparison and a value) joined by "all of
 * these" or "any of these", one level deep. A condition the rows cannot show (from the seed or an
 * earlier version) is shown with a note and can only be removed and written again.
 */
export function ConditionEditor({
  title,
  heading = true,
  definition,
  asker,
  condition,
  onChange,
}: {
  title: string;
  /** false inside a dialog that already shows the title. */
  heading?: boolean;
  definition: FormDefinition;
  asker: Asker;
  condition: Condition | null | undefined;
  /** `how` says a value was typed, so the history joins it to the typing just before it. */
  onChange: (condition: Condition | undefined, how?: Typed) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const view = rowsFromCondition(condition);
  const candidates = conditionCandidates(definition, asker);
  const byKey = new Map(candidates.map((f) => [f.fieldKey, f]));
  const keys = useRowKeys(view.kind === 'complex' ? 0 : view.rows.length);

  if (view.kind === 'complex')
    return (
      <section aria-label={title}>
        <Stack gap={2}>
          {heading ? (
            <Text>
              <strong>{title}</strong>
            </Text>
          ) : null}
          <Alert tone="info">{t('cond_complex')}</Alert>
          <Button
            size="small"
            variant="secondary"
            startIcon="delete"
            onClick={() => onChange(undefined)}
          >
            {t('cond_clear')}
          </Button>
        </Stack>
      </section>
    );

  const { join, rows } = view;
  const write = (next: ConditionRow[], nextJoin = join, how?: Typed) =>
    onChange(conditionFromRows({ join: nextJoin, rows: next }), how);
  const setRow = (index: number, row: ConditionRow, how?: Typed) =>
    write(
      rows.map((r, i) => (i === index ? row : r)),
      join,
      how,
    );
  // the answers a row may compare with: another question whose answer is of the same kind
  const others = (key: string, field: FormField) =>
    candidates.filter((f) => f.fieldKey !== key && opKindOf(f) === opKindOf(field));
  const fresh = (field: FormField): ConditionRow => ({
    field: field.fieldKey,
    op: OPS[opKindOf(field)][0]!,
  });

  return (
    <section aria-label={title}>
      <Stack gap={2}>
        {heading ? (
          <Text>
            <strong>{title}</strong>
          </Text>
        ) : null}
        {rows.length === 0 ? <Text tone="muted">{t('cond_hint')}</Text> : null}
        {rows.length > 1 ? (
          <RadioGroup
            orientation="horizontal"
            label={t('cond_join')}
            value={join}
            onChange={(id: string) => write(rows, id === 'any' ? 'any' : 'all')}
            options={[
              { value: 'all', label: t('cond_all') },
              { value: 'any', label: t('cond_any') },
            ]}
          />
        ) : null}
        {rows.map((row, i) => {
          const n = String(i + 1);
          const field = byKey.get(row.field);
          const ops = field ? OPS[opKindOf(field)] : OPS.text;
          return (
            <div key={keys.keys[i]} className="form-settings-row">
              <Stack gap={1}>
                <SelectField
                  label={t('cond_field', { n })}
                  value={field ? row.field : ''}
                  onChange={(id) => {
                    const next = id ? byKey.get(id) : undefined;
                    if (next) setRow(i, fresh(next));
                  }}
                  options={candidates.map((f) => ({
                    value: f.fieldKey,
                    label: localized(f.label, locale),
                  }))}
                />
                <SelectField
                  label={t('cond_op', { n })}
                  value={row.op}
                  onChange={(id) => {
                    const op = ops.find((o) => o === id);
                    if (!op) return;
                    // a list comparison takes a list, the others one value; an emptiness check none
                    const listChange =
                      (op === 'in' || op === 'not_in') !== Array.isArray(row.value);
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
                  options={ops.map((op) => ({ value: op, label: t(`ops.${op}`) }))}
                />
                {field && COMPARABLE.has(row.op) && others(row.field, field).length > 0 ? (
                  <RadioGroup
                    orientation="horizontal"
                    label={t('cond_against', { n })}
                    value={isFieldRef(row.value) ? 'answer' : 'value'}
                    onChange={(id: string) =>
                      setRow(i, {
                        field: row.field,
                        op: row.op,
                        ...(id === 'answer'
                          ? { value: { field: others(row.field, field)[0]!.fieldKey } }
                          : {}),
                      })
                    }
                    options={[
                      { value: 'value', label: t('cond_against_value') },
                      { value: 'answer', label: t('cond_against_answer') },
                    ]}
                  />
                ) : null}
                {field && isFieldRef(row.value) ? (
                  <SelectField
                    label={t('cond_other', { n })}
                    value={row.value.field}
                    onChange={(id) =>
                      id && setRow(i, { field: row.field, op: row.op, value: { field: id } })
                    }
                    options={others(row.field, field).map((f) => ({
                      value: f.fieldKey,
                      label: localized(f.label, locale),
                    }))}
                  />
                ) : field ? (
                  <ValueInput
                    label={t('cond_value', { n })}
                    field={field}
                    op={row.op}
                    value={row.value}
                    onChange={(value, how) =>
                      setRow(
                        i,
                        { field: row.field, op: row.op, ...(value === undefined ? {} : { value }) },
                        how,
                      )
                    }
                  />
                ) : null}
                <RowButtons
                  remove={{
                    label: t('cond_remove', { n }),
                    onPress: () => {
                      keys.remove(i);
                      write(rows.filter((_, j) => j !== i));
                    },
                  }}
                />
              </Stack>
            </div>
          );
        })}
        <Button
          size="small"
          variant="secondary"
          startIcon="add"
          disabled={candidates.length === 0}
          onClick={() => write([...rows, fresh(candidates[0]!)])}
        >
          {t('cond_add')}
        </Button>
      </Stack>
    </section>
  );
}

/** The comparisons that may compare one answer with another. */
const COMPARABLE: ReadonlySet<ConditionOp> = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);

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
  onChange: (value: unknown, how?: Typed) => void;
}) {
  const locale = useLocale();
  if (op === 'is_empty' || op === 'not_empty') return null;
  const kind = opKindOf(field);
  if (kind === 'choice') {
    const options = (field.options ?? []).map((o) => ({
      value: o.code,
      label: localized(o.label, locale),
    }));
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
      <SelectField
        label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(id) => onChange(id || undefined)}
        options={options}
      />
    );
  }
  if (kind === 'number')
    return (
      <NumberText
        label={label}
        value={typeof value === 'number' ? value : undefined}
        onChange={(n) => onChange(n, TYPED)}
      />
    );
  if (kind === 'date')
    return (
      <DateField
        label={label}
        value={typeof value === 'string' ? value : ''}
        onChange={(iso) => onChange(iso || undefined)}
      />
    );
  return (
    <TextField
      label={label}
      value={typeof value === 'string' ? value : ''}
      onChange={(text) => onChange(text === '' ? undefined : text, TYPED)}
    />
  );
}
