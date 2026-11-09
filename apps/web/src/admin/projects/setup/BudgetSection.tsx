import { formatTaka } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { FUND_SOURCES, isAmount, plannedBudgetPaisa, sumPaisa } from '@css/shared/projects';
import { Alert, Button, IconButton, SelectField, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { type FundSource, saveFundSources } from './setup-api';
import { SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';
import { useRowKeys } from '../../../lib/use-row-keys';

type Row = { source: FundSource['source']; label: string; amount: string };

const MAX_SOURCES = 10;

/** Paisa as taka through the central formatter (a budget stays far below 2^53 paisa). */
const taka = (paisa: bigint | null, locale: Locale) =>
  paisa === null ? '—' : formatTaka(Number(paisa) / 100, locale);

/**
 * Cost per beneficiary × target, and the fund sources that pay for it, saved together: once the
 * project is active their total always equals the planned budget (DECISION_LOG D-095).
 */
export function BudgetSection({ sources }: { sources: FundSource[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const locale = useLocale() as Locale;
  const [cost, setCost] = useState(project.costPerBeneficiary ?? '');
  const [target, setTarget] = useState(
    project.targetBeneficiaries === null || project.targetBeneficiaries === undefined
      ? ''
      : String(project.targetBeneficiaries),
  );
  const [rows, setRows] = useState<Row[]>(
    sources.map((s) => ({ source: s.source, label: s.label ?? '', amount: s.amount })),
  );
  const can = editable('fundSources') && editable('costPerBeneficiary');

  const amountsOk = rows.every(
    (r) => isAmount(r.amount) && (r.source !== 'donor' || r.label.trim() !== ''),
  );
  const targetOk = /^\d+$/.test(target) && Number(target) > 0;
  const planned = isAmount(cost) && targetOk ? plannedBudgetPaisa(cost, Number(target)) : null;
  const total = amountsOk ? sumPaisa(rows.map((r) => r.amount)) : null;
  const equal = planned !== null && total === planned;

  const save = useMutation({
    mutationFn: () =>
      saveFundSources(project.id, {
        ...(isAmount(cost) ? { costPerBeneficiary: cost } : {}),
        ...(targetOk ? { targetBeneficiaries: Number(target) } : {}),
        fundSources: rows.map((r) => ({
          source: r.source,
          amount: r.amount,
          ...(r.label.trim() ? { label: r.label.trim() } : {}),
        })),
      }),
  });
  const before = JSON.stringify({
    cost: project.costPerBeneficiary ?? '',
    target: String(project.targetBeneficiaries ?? ''),
    rows: sources.map((s) => ({ source: s.source, label: s.label ?? '', amount: s.amount })),
  });
  const problem = useStepSave({
    changed: can && JSON.stringify({ cost, target, rows }) !== before,
    invalid: !amountsOk
      ? tz('budget_invalid')
      : project.status !== 'draft' && !equal
        ? t('fund_mismatch')
        : undefined,
    save: async () => {
      await save.mutateAsync();
      await refresh();
    },
  });
  const keys = useRowKeys(rows.length);
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <SetupSection id="budget" title={t('section.budget')}>
      <div className="admin-setup-grid">
        <TextField type="money" label={t('cost')} value={cost} onChange={setCost} readOnly={!can} />
        <TextField
          type="integer"
          label={t('target')}
          value={target}
          onChange={setTarget}
          readOnly={!can}
        />
      </div>
      <p className="admin-muted">{t('planned', { amount: taka(planned, locale) })}</p>
      <h3 className="admin-setup-subtitle">{t('fund_sources')}</h3>
      {rows.map((r, i) => (
        <div key={keys.keys[i]} className="admin-setup-row">
          <SelectField
            label={t('fund_source')}
            value={r.source}
            onChange={(id) => id && setRow(i, { source: id as Row['source'] })}
            disabled={!can}
            searchable={false}
            options={FUND_SOURCES.map((s) => ({ value: s, label: t(`source.${s}`) }))}
          />
          {r.source === 'donor' && (
            <TextField
              label={t('donor_name')}
              required
              maxLength={200}
              value={r.label}
              onChange={(label) => setRow(i, { label })}
              readOnly={!can}
            />
          )}
          <TextField
            type="money"
            label={t('amount')}
            value={r.amount}
            onChange={(amount) => setRow(i, { amount })}
            readOnly={!can}
          />
          {can && (
            <IconButton
              label={t('remove_source', { number: String(i + 1) })}
              icon="delete"

              onClick={() => {
                keys.remove(i);
                setRows(rows.filter((_, j) => j !== i));
              }}
            />
          )}
        </div>
      ))}
      {can && rows.length < MAX_SOURCES && (
        <Button
          variant="text"
          size="small"
          startIcon="add"
          onClick={() => setRows([...rows, { source: 'general', label: '', amount: '' }])}
        >
          {t('add_source')}
        </Button>
      )}
      <p className="admin-muted">{t('fund_total', { amount: taka(total, locale) })}</p>
      {planned !== null && total !== null && !equal && (
        <Alert tone={project.status === 'draft' ? 'info' : 'warning'}>{t('fund_mismatch')}</Alert>
      )}
      <SaveNotice mutation={save} problem={problem} />
    </SetupSection>
  );
}
