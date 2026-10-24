import type { Calculation, FormDefinition, FormField } from '@css/shared/forms';
import { Alert, Button, Select, Stack, Text } from '@css/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { type Asker, dateCandidates, netCandidates, termCandidates } from './candidates';
import { type CalcShape, exprFromTerms, type Term, termsFromExpr } from './calc-terms';
import { NumberText } from './NumberText';
import { RowButtons } from './RowButtons';

type Kind = 'chain' | 'mul' | 'div' | 'age' | 'nisab';

const NUMBER_ID = 'n';
const termId = (term: Term) =>
  term.kind === 'number'
    ? NUMBER_ID
    : term.kind === 'field'
      ? `f:${term.key}`
      : `s:${term.group}:${term.field}`;

/**
 * The calculation of a calculated question: a row of terms joined by plus and minus, two terms
 * multiplied or divided, the age from a date of birth, or net assets compared with the nisab in
 * force. A term is a number question, an amount, another calculation, a number, or a group
 * question added up over the group's rows. A calculation these shapes cannot show (from an earlier
 * version) is shown with a note and can only be removed and written again.
 */
export function CalculationEditor({
  heading = true,
  definition,
  field,
  asker,
  onChange,
}: {
  /** false inside a dialog that already shows the title. */
  heading?: boolean;
  definition: FormDefinition;
  field: FormField;
  asker: Asker;
  onChange: (calculation: Calculation) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const view = field.calculation
    ? termsFromExpr(field.calculation.expr)
    : ({ kind: 'chain', terms: [] } as const);
  const { fields, sums } = termCandidates(definition, asker);
  const dates = dateCandidates(definition, asker);
  const nets = netCandidates(definition, asker);
  const write = (shape: CalcShape) =>
    onChange({ ...field.calculation, expr: exprFromTerms(shape) });

  if (view.kind === 'complex')
    return (
      <Stack as="section" gap={2} aria-label={t('calc')}>
        {heading ? <Text weight="bold">{t('calc')}</Text> : null}
        <Alert tone="info">{t('calc_complex')}</Alert>
        <Button
          size="sm"
          variant="secondary"
          icon={Trash2}
          onPress={() => write({ kind: 'chain', terms: [] })}
        >
          {t('calc_clear')}
        </Button>
      </Stack>
    );

  const kind: Kind = view.kind === 'product' ? view.op : view.kind;
  const firstTerm: Term = fields[0]
    ? { kind: 'field', key: fields[0].fieldKey }
    : { kind: 'number', value: 0 };
  const startShape = (next: Kind): CalcShape | null => {
    if (next === 'chain') return { kind: 'chain', terms: [] };
    if (next === 'mul' || next === 'div')
      return { kind: 'product', op: next, left: firstTerm, right: { kind: 'number', value: 1 } };
    if (next === 'age') return dates[0] ? { kind: 'age', dob: dates[0].fieldKey } : null;
    return nets[0] ? { kind: 'nisab', net: nets[0].fieldKey } : null;
  };
  // the ready rules are offered only when the form has a question they can read
  const kinds: Kind[] = [
    'chain',
    'mul',
    'div',
    ...(dates.length ? (['age'] as const) : []),
    ...(nets.length ? (['nisab'] as const) : []),
  ];

  const termOptions = [
    ...fields.map((f) => ({ id: `f:${f.fieldKey}`, label: f.label[locale] })),
    ...sums.map((s) => ({
      id: `s:${s.group.fieldKey}:${s.field.fieldKey}`,
      label: t('term_group_sum', { field: s.field.label[locale], group: s.group.label[locale] }),
    })),
    { id: NUMBER_ID, label: t('term_number') },
  ];
  const termFrom = (id: string | null, current: Term): Term => {
    if (!id || id === termId(current)) return current;
    if (id === NUMBER_ID) return { kind: 'number', value: 0 };
    if (id.startsWith('f:')) return { kind: 'field', key: id.slice(2) };
    const [, group = '', member = ''] = id.split(':');
    return { kind: 'group_sum', group, field: member };
  };
  const termInput = (label: string, valueLabel: string, term: Term, set: (t: Term) => void) => (
    <>
      <Select
        label={label}
        value={termId(term)}
        onChange={(id) => set(termFrom(id, term))}
        options={termOptions}
      />
      {term.kind === 'number' ? (
        <NumberText
          label={valueLabel}
          value={term.value}
          onChange={(value) => set({ kind: 'number', value: value ?? 0 })}
        />
      ) : null}
    </>
  );

  return (
    <Stack as="section" gap={2} aria-label={t('calc')}>
      {heading ? <Text weight="bold">{t('calc')}</Text> : null}
      <Select
        label={t('calc_kind')}
        value={kind}
        onChange={(id) => {
          const next = kinds.find((k) => k === id);
          const shape = next && next !== kind ? startShape(next) : null;
          if (shape) write(shape);
        }}
        options={kinds.map((k) => ({ id: k, label: t(`calc_kinds.${k}`) }))}
      />
      {view.kind === 'chain' ? (
        <>
          {view.terms.map((entry, i) => {
            const n = String(i + 1);
            const set = (next: { sign: 1 | -1; term: Term }) =>
              write({
                kind: 'chain',
                terms: view.terms.map((e, j) => (j === i ? next : e)),
              });
            return (
              <Stack key={i} gap={1} className="form-settings-row">
                <Select
                  label={t('term_sign', { n })}
                  value={entry.sign > 0 ? 'plus' : 'minus'}
                  onChange={(id) => set({ ...entry, sign: id === 'minus' ? -1 : 1 })}
                  options={[
                    { id: 'plus', label: t('sign_plus') },
                    { id: 'minus', label: t('sign_minus') },
                  ]}
                />
                {termInput(t('term', { n }), t('term_value', { n }), entry.term, (term) =>
                  set({ ...entry, term }),
                )}
                <RowButtons
                  remove={{
                    label: t('term_remove', { n }),
                    onPress: () =>
                      write({ kind: 'chain', terms: view.terms.filter((_, j) => j !== i) }),
                  }}
                />
              </Stack>
            );
          })}
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onPress={() =>
              write({ kind: 'chain', terms: [...view.terms, { sign: 1, term: firstTerm }] })
            }
          >
            {t('term_add')}
          </Button>
        </>
      ) : null}
      {view.kind === 'product' ? (
        <>
          {termInput(t('left'), t('left_value'), view.left, (left) => write({ ...view, left }))}
          {termInput(t('right'), t('right_value'), view.right, (right) =>
            write({ ...view, right }),
          )}
        </>
      ) : null}
      {view.kind === 'age' ? (
        <Select
          label={t('dob')}
          value={view.dob}
          onChange={(id) => id && write({ kind: 'age', dob: id })}
          options={dates.map((f) => ({ id: f.fieldKey, label: f.label[locale] }))}
        />
      ) : null}
      {view.kind === 'nisab' ? (
        <Select
          label={t('net')}
          value={view.net}
          onChange={(id) => id && write({ kind: 'nisab', net: id })}
          options={nets.map((f) => ({ id: f.fieldKey, label: f.label[locale] }))}
        />
      ) : null}
    </Stack>
  );
}
