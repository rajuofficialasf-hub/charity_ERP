import type { Condition, Expr } from '@css/shared';
import type { Calculation, CalculationResult, FormDefinition, FormField } from '@css/shared/forms';
import { Alert, Button, SelectField, Stack, Text, TextField, RadioGroup } from '@/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  MATH_OPS,
  type MathOp,
  PART_KINDS,
  type PartKind,
  type PartStarts,
  partKindOf,
  startCondition,
  startPart,
  withArg,
} from './calc-tree';
import {
  type Asker,
  conditionCandidates,
  dateCandidates,
  netCandidates,
  termCandidates,
} from './candidates';
import { ConditionEditor } from './ConditionEditor';
import { type FormulaNames, parseFormula, printFormula } from './formula';
import { NumberText } from './NumberText';
import { RowButtons } from './RowButtons';

/** A sum or product of parts. */
type MathExpr = { op: MathOp; args: Expr[] };

/** How deep the parts may nest here; deeper calculations are written as a formula. */
const MAX_DEPTH = 6;

interface Context {
  definition: FormDefinition;
  field: FormField;
  asker: Asker;
  starts: PartStarts;
  /** The questions, group sums, groups, tables and dates each part may read. */
  offers: {
    fields: FormField[];
    sums: { group: FormField; field: FormField }[];
    groups: FormField[];
    tables: FormField[];
    dates: FormField[];
    nets: FormField[];
  };
}

/**
 * The calculation of a calculated question, built part by part by clicking: a question, a number,
 * a sum or product of further parts (a bracket when it sits inside another), a "যদি … তবে … নইলে"
 * step with its conditions, a group's sum or row count, a table's cell, a text result, or a ready
 * rule. A builder who would rather write may type the same calculation as a formula. Text results
 * are listed with the calculation, and the result may be rounded.
 */
export function CalculationEditor({
  heading = true,
  definition,
  field,
  asker,
  onChange,
  onResults,
}: {
  /** false inside a dialog that already shows the title. */
  heading?: boolean;
  definition: FormDefinition;
  field: FormField;
  asker: Asker;
  onChange: (calculation: Calculation | undefined) => void;
  onResults: (results: CalculationResult[] | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const [mode, setMode] = useState<'click' | 'type'>('click');
  /** The typed formula; kept here so a formula with a mistake survives a switch to clicking. */
  const [typed, setTyped] = useState<string | null>(null);
  const { fields, sums } = termCandidates(definition, asker);
  const all = definition.sections.flatMap((s) => s.fields);
  const groups = asker.group === null ? all.filter((f) => f.type === 'repeat_group') : [];
  const tables = all.filter(
    (f) => f.type === 'number_table' && f.fieldKey !== asker.fieldKey && asker.group === null,
  );
  const conditions = conditionCandidates(definition, asker);
  const results = field.settings?.results ?? [];
  const firstTable = tables[0];
  const dates = dateCandidates(definition, asker);
  const nets = netCandidates(definition, asker);
  const ctx: Context = {
    definition,
    field,
    asker,
    offers: {
      fields,
      sums,
      groups,
      tables,
      dates,
      nets,
    },
    starts: {
      field: fields[0]?.fieldKey,
      sum: sums[0] ? { group: sums[0].group.fieldKey, field: sums[0].field.fieldKey } : undefined,
      group: groups[0]?.fieldKey,
      cell:
        firstTable?.settings?.table?.rows[0] && firstTable.settings.table.cols[0]
          ? {
              field: firstTable.fieldKey,
              row: firstTable.settings.table.rows[0].key,
              col: firstTable.settings.table.cols[0].key,
            }
          : undefined,
      result: results[0]?.code,
      date: dates[0]?.fieldKey,
      net: nets[0]?.fieldKey,
      // a new branch starts with the question just before this one, the likeliest to compare
      condition: (
        conditions
          .filter(
            (c) =>
              all.findIndex((f) => f.fieldKey === c.fieldKey) <
              all.findIndex((f) => f.fieldKey === field.fieldKey),
          )
          .at(-1) ?? conditions[0]
      )?.fieldKey,
    },
  };
  const expr = field.calculation?.expr;
  const write = (next: Expr | undefined) =>
    onChange(next === undefined ? undefined : { ...field.calculation, expr: next });

  return (
    <section aria-label={t('calc')}>
      <Stack gap={3}>
        {heading ? (
          <Text>
            <strong>{t('calc')}</strong>
          </Text>
        ) : null}
        <RadioGroup
          orientation="horizontal"
          label={t('calc_mode')}
          value={mode}
          onChange={(next: string) => setMode(next === 'type' ? 'type' : 'click')}
          options={[
            { value: 'click', label: t('calc_mode_click') },
            { value: 'type', label: t('calc_mode_type') },
          ]}
        />
        {mode === 'type' ? (
          <FormulaInput
            ctx={ctx}
            text={typed ?? (expr === undefined ? '' : printFormula(expr))}
            onText={setTyped}
            onChange={write}
          />
        ) : (
          <PartEditor ctx={ctx} label={t('calc_root')} expr={expr} depth={0} onChange={write} />
        )}
        {mode === 'click' && typed !== null && !formulaReads(ctx, typed) ? (
          <Alert tone="warning">{t('calc_formula_kept')}</Alert>
        ) : null}
        <SelectField
          label={t('calc_round')}
          disabled={!field.calculation}
          value={field.calculation?.round === undefined ? 'none' : String(field.calculation.round)}
          onChange={(id) => {
            if (!field.calculation) return;
            const { round: _old, ...rest } = field.calculation;
            onChange(id === 'none' || id === null ? rest : { ...rest, round: Number(id) });
          }}
          options={[
            { value: 'none', label: t('calc_round_none') },
            ...[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })),
          ]}
        />
        <ResultsEditor results={results} onChange={onResults} />
      </Stack>
    </section>
  );
}

/** One part of the calculation: its kind, then what that kind reads. */
function PartEditor({
  ctx,
  label,
  expr,
  depth,
  onChange,
}: {
  ctx: Context;
  label: string;
  expr: Expr | undefined;
  depth: number;
  onChange: (next: Expr | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const kind = expr === undefined ? null : partKindOf(expr);
  // a kind is offered only when the form has something it can read, and nesting stays shallow
  const nests = (k: PartKind) => k === 'math' || k === 'if';
  const kinds = PART_KINDS.filter(
    (k) => k === kind || ((!nests(k) || depth < MAX_DEPTH) && startPart(k, ctx.starts) !== null),
  );
  const { offers } = ctx;
  const labelOf = (f: FormField) => f.label[locale];
  return (
    <div className="form-calc-part">
      <Stack gap={2}>
        <SelectField
          label={t('calc_kind_of', { part: label })}
          value={kind ?? ''}
          onChange={(id) => {
            const next = PART_KINDS.find((k) => k === id);
            if (!next || next === kind) return;
            const part = startPart(next, ctx.starts);
            if (part !== null) onChange(part);
          }}
          options={kinds.map((k) => ({ value: k, label: t(`calc_parts.${k}`) }))}
        />
        {expr !== undefined && typeof expr === 'number' ? (
          <NumberText
            label={t('calc_number', { part: label })}
            value={expr}
            onChange={(value) => onChange(value ?? 0)}
          />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'field' in expr ? (
          <SelectField
            label={t('calc_question', { part: label })}
            value={expr.field}
            onChange={(id) => id && onChange({ field: id })}
            options={offers.fields.map((f) => ({ value: f.fieldKey, label: labelOf(f) }))}
          />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'result' in expr ? (
          <SelectField
            label={t('calc_result', { part: label })}
            value={expr.result}
            onChange={(id) => id && onChange({ result: id })}
            options={(ctx.field.settings?.results ?? []).map((r) => ({
              value: r.code,
              label: r.label[locale],
            }))}
          />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'sum_repeat' in expr ? (
          <SelectField
            label={t('calc_sum', { part: label })}
            value={`${expr.sum_repeat.group}:${expr.sum_repeat.field}`}
            onChange={(id) => {
              const [group = '', member = ''] = (id ?? '').split(':');
              if (group && member) onChange({ sum_repeat: { group, field: member } });
            }}
            options={offers.sums.map((s) => ({
              value: `${s.group.fieldKey}:${s.field.fieldKey}`,
              label: t('term_group_sum', { group: labelOf(s.group), field: labelOf(s.field) }),
            }))}
          />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'count_rows' in expr ? (
          <CountPart ctx={ctx} label={label} expr={expr} onChange={onChange} />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'cell' in expr ? (
          <CellPart ctx={ctx} label={label} expr={expr} onChange={onChange} />
        ) : null}
        {expr !== undefined && typeof expr === 'object' && 'if' in expr ? (
          <StepPart ctx={ctx} label={label} expr={expr} depth={depth} onChange={onChange} />
        ) : null}
        {kind === 'age' && expr !== undefined && typeof expr === 'object' && 'args' in expr ? (
          <SelectField
            label={t('dob')}
            value={
              'field' in (expr.args[0] as object) ? (expr.args[0] as { field: string }).field : ''
            }
            onChange={(id) => id && onChange({ op: 'age_from_dob', args: [{ field: id }] })}
            options={offers.dates.map((f) => ({ value: f.fieldKey, label: labelOf(f) }))}
          />
        ) : null}
        {kind === 'nisab' && expr !== undefined && typeof expr === 'object' && 'args' in expr ? (
          <SelectField
            label={t('net')}
            value={
              'field' in (expr.args[0] as object) ? (expr.args[0] as { field: string }).field : ''
            }
            onChange={(id) =>
              id &&
              onChange({ op: 'compare_gte', args: [{ field: id }, { setting: 'nisab_value' }] })
            }
            options={offers.nets.map((f) => ({ value: f.fieldKey, label: labelOf(f) }))}
          />
        ) : null}
        {kind === 'math' && expr !== undefined && typeof expr === 'object' && 'args' in expr ? (
          <MathPart
            ctx={ctx}
            label={label}
            expr={expr as MathExpr}
            depth={depth}
            onChange={onChange}
          />
        ) : null}
      </Stack>
    </div>
  );
}

/** A sum or product of parts; inside another part it is a bracket. */
function MathPart({
  ctx,
  label,
  expr,
  depth,
  onChange,
}: {
  ctx: Context;
  label: string;
  expr: MathExpr;
  depth: number;
  onChange: (next: Expr) => void;
}) {
  const t = useTranslations('forms.builder');
  return (
    <div className="form-calc-group" role="group" aria-label={label}>
      <Stack gap={2}>
        <SelectField
          label={t('calc_op', { part: label })}
          value={expr.op}
          onChange={(id) => {
            const op = MATH_OPS.find((o) => o === id);
            if (op) onChange({ op, args: expr.args });
          }}
          options={MATH_OPS.map((op) => ({ value: op, label: t(`calc_ops.${op}`) }))}
        />
        {expr.args.map((arg, i) => {
          const name = t('calc_part', { part: label, n: String(i + 1) });
          return (
            <div key={i}>
              <Stack gap={1}>
                <PartEditor
                  ctx={ctx}
                  label={name}
                  expr={arg}
                  depth={depth + 1}
                  onChange={(next) => onChange(withArg(expr, i, next ?? null))}
                />
                {expr.args.length > 1 ? (
                  <RowButtons
                    remove={{
                      label: t('calc_part_remove', { part: name }),
                      onPress: () => onChange(withArg(expr, i, null)),
                    }}
                  />
                ) : null}
              </Stack>
            </div>
          );
        })}
        <Stack direction="row" gap={2} wrap>
          <Button
            size="small"
            variant="secondary"
            startIcon="add"
            onClick={() => onChange({ ...expr, args: [...expr.args, 0] })}
          >
            {t('calc_add_part')}
          </Button>
          {depth + 1 < MAX_DEPTH ? (
            <Button
              size="small"
              variant="secondary"
              startIcon="add"
              onClick={() => onChange({ ...expr, args: [...expr.args, { op: 'add', args: [0] }] })}
            >
              {t('calc_add_bracket')}
            </Button>
          ) : null}
          {depth + 1 < MAX_DEPTH && ctx.starts.condition ? (
            <Button
              size="small"
              variant="secondary"
              startIcon="add"
              onClick={() => {
                const step = startPart('if', ctx.starts);
                if (step !== null) onChange({ ...expr, args: [...expr.args, step] });
              }}
            >
              {t('calc_add_step')}
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </div>
  );
}

/** "যদি … তবে … নইলে": each branch a condition and a value, then the value otherwise. */
function StepPart({
  ctx,
  label,
  expr,
  depth,
  onChange,
}: {
  ctx: Context;
  label: string;
  expr: Extract<Expr, { if: unknown }>;
  depth: number;
  onChange: (next: Expr) => void;
}) {
  const t = useTranslations('forms.builder');
  const setBranch = (i: number, next: { when: Condition; then: Expr } | null) => {
    const branches =
      next === null
        ? expr.if.filter((_, j) => j !== i)
        : expr.if.map((b, j) => (j === i ? next : b));
    // a step without branches is just its last value
    onChange(branches.length ? { if: branches, else: expr.else } : expr.else);
  };
  return (
    <div className="form-calc-group" role="group" aria-label={label}>
      <Stack gap={2}>
        {expr.if.map((branch, i) => {
          const n = String(i + 1);
          return (
            <div key={i}>
              <Stack gap={2}>
                <ConditionEditor
                  title={t('calc_if', { n })}
                  definition={ctx.definition}
                  asker={ctx.asker}
                  condition={branch.when}
                  onChange={(when) =>
                    when ? setBranch(i, { when, then: branch.then }) : setBranch(i, null)
                  }
                />
                <PartEditor
                  ctx={ctx}
                  label={t('calc_then', { n })}
                  expr={branch.then}
                  depth={depth + 1}
                  onChange={(then) => setBranch(i, { when: branch.when, then: then ?? 0 })}
                />
              </Stack>
            </div>
          );
        })}
        <div>
          <Button
            size="small"
            variant="secondary"
            startIcon="add"
            onClick={() => {
              const when = startCondition(ctx.starts);
              if (when) onChange({ if: [...expr.if, { when, then: 0 }], else: expr.else });
            }}
          >
            {t('calc_add_branch')}
          </Button>
        </div>
        <PartEditor
          ctx={ctx}
          label={t('calc_else')}
          expr={expr.else}
          depth={depth + 1}
          onChange={(next) => onChange({ if: expr.if, else: next ?? 0 })}
        />
      </Stack>
    </div>
  );
}

/** The rows of a group, or only those that meet a condition. */
function CountPart({
  ctx,
  label,
  expr,
  onChange,
}: {
  ctx: Context;
  label: string;
  expr: Extract<Expr, { count_rows: unknown }>;
  onChange: (next: Expr) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const { group, where } = expr.count_rows;
  return (
    <Stack gap={2}>
      <SelectField
        label={t('calc_group', { part: label })}
        value={group}
        onChange={(id) => id && onChange({ count_rows: { group: id } })}
        options={ctx.offers.groups.map((g) => ({ value: g.fieldKey, label: g.label[locale] }))}
      />
      <ConditionEditor
        title={t('calc_count_where')}
        definition={ctx.definition}
        asker={{ group, fieldKey: ctx.asker.fieldKey }}
        condition={where}
        onChange={(next) => onChange({ count_rows: next ? { group, where: next } : { group } })}
      />
    </Stack>
  );
}

/** One cell of a number table: the table, its row and its column. */
function CellPart({
  ctx,
  label,
  expr,
  onChange,
}: {
  ctx: Context;
  label: string;
  expr: Extract<Expr, { cell: unknown }>;
  onChange: (next: Expr) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const table = ctx.offers.tables.find((f) => f.fieldKey === expr.cell.field);
  const rows = table?.settings?.table?.rows ?? [];
  const cols = table?.settings?.table?.cols ?? [];
  return (
    <Stack gap={2}>
      <SelectField
        label={t('calc_table', { part: label })}
        value={expr.cell.field}
        onChange={(id) => {
          const next = ctx.offers.tables.find((f) => f.fieldKey === id);
          const row = next?.settings?.table?.rows[0]?.key;
          const col = next?.settings?.table?.cols[0]?.key;
          if (next && row && col) onChange({ cell: { field: next.fieldKey, row, col } });
        }}
        options={ctx.offers.tables.map((f) => ({ value: f.fieldKey, label: f.label[locale] }))}
      />
      <SelectField
        label={t('calc_table_row', { part: label })}
        value={expr.cell.row}
        onChange={(id) => id && onChange({ cell: { ...expr.cell, row: id } })}
        options={rows.map((r) => ({ value: r.key, label: r.label[locale] }))}
      />
      <SelectField
        label={t('calc_table_col', { part: label })}
        value={expr.cell.col}
        onChange={(id) => id && onChange({ cell: { ...expr.cell, col: id } })}
        options={cols.map((c) => ({ value: c.key, label: c.label[locale] }))}
      />
    </Stack>
  );
}

/** What a typed formula may name, from what the question reaches. */
function formulaNames(ctx: Context): FormulaNames {
  return {
    fields: new Set(
      [...ctx.offers.fields, ...conditionCandidates(ctx.definition, ctx.asker)].map(
        (f) => f.fieldKey,
      ),
    ),
    groups: new Map(
      ctx.offers.groups.map((g) => [
        g.fieldKey,
        new Set(
          ctx.definition.sections
            .flatMap((s) => s.fields)
            .filter((m) => m.settings?.repeat?.group === g.fieldKey)
            .map((m) => m.fieldKey),
        ),
      ]),
    ),
    tables: new Map(
      ctx.offers.tables.map((f) => [
        f.fieldKey,
        {
          rows: new Set((f.settings?.table?.rows ?? []).map((r) => r.key)),
          cols: new Set((f.settings?.table?.cols ?? []).map((c) => c.key)),
        },
      ]),
    ),
    results: new Set((ctx.field.settings?.results ?? []).map((r) => r.code)),
  };
}

/** Whether a typed text is empty or reads as a formula. */
function formulaReads(ctx: Context, text: string): boolean {
  return text.trim() === '' || parseFormula(text, formulaNames(ctx)).ok;
}

/**
 * The calculation typed as a formula: a valid one is written at once, an emptied one removes the
 * calculation, and a mistake is named while the last valid calculation stays.
 */
function FormulaInput({
  ctx,
  text,
  onText,
  onChange,
}: {
  ctx: Context;
  text: string;
  onText: (text: string) => void;
  onChange: (next: Expr | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const names = formulaNames(ctx);
  const reading = text.trim() === '' ? null : parseFormula(text, names);
  return (
    <Stack gap={2}>
      <TextField
        rows={4}
        label={t('calc_formula')}
        hint={t('calc_formula_help')}
        value={text}
        error={
          reading && !reading.ok
            ? t(`calc_formula_errors.${reading.error.code}`, {
                name: reading.error.name ?? '',
                column: String(reading.error.column),
              })
            : undefined
        }
        onChange={(next) => {
          onText(next);
          if (next.trim() === '') return onChange(undefined);
          const read = parseFormula(next, names);
          if (read.ok) onChange(read.expr);
        }}
      />
    </Stack>
  );
}

/** The text results a calculation may give, each with its label in both languages. */
function ResultsEditor({
  results,
  onChange,
}: {
  results: CalculationResult[];
  onChange: (results: CalculationResult[] | undefined) => void;
}) {
  const t = useTranslations('forms.builder');
  const set = (i: number, next: CalculationResult | null) => {
    const list =
      next === null
        ? results.filter((_, j) => j !== i)
        : results.map((r, j) => (j === i ? next : r));
    onChange(list.length ? list : undefined);
  };
  // a new result's code is the first free r1, r2, …
  const freeCode = () => {
    const used = new Set(results.map((r) => r.code));
    let n = results.length + 1;
    while (used.has(`r${n}`)) n += 1;
    return `r${n}`;
  };
  return (
    <div role="group" aria-label={t('calc_results')}>
      <Stack gap={2}>
        <Text>
          <strong>{t('calc_results')}</strong>
        </Text>
        <Text tone="muted">{t('calc_results_help')}</Text>
        {results.map((result, i) => {
          const n = String(i + 1);
          return (
            <div key={result.code} className="form-settings-row">
              <Stack gap={1}>
                <TextField
                  label={t('calc_result_bn', { n })}
                  value={result.label.bn}
                  onChange={(bn) => set(i, { ...result, label: { ...result.label, bn } })}
                />
                <TextField
                  label={t('calc_result_en', { n })}
                  value={result.label.en}
                  onChange={(en) => set(i, { ...result, label: { ...result.label, en } })}
                />
                <RowButtons
                  remove={{ label: t('calc_result_remove', { n }), onPress: () => set(i, null) }}
                />
              </Stack>
            </div>
          );
        })}
        <div>
          <Button
            size="small"
            variant="secondary"
            startIcon="add"
            onClick={() =>
              onChange([
                ...results,
                { code: freeCode(), label: { bn: t('calc_result_new'), en: t('calc_result_new') } },
              ])
            }
          >
            {t('calc_result_add')}
          </Button>
        </div>
        {results.length === 0 ? null : <Alert tone="info">{t('calc_results_note')}</Alert>}
      </Stack>
    </div>
  );
}
