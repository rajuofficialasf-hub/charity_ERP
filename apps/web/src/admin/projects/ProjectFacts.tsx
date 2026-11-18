import { DescriptionList } from '@/ui';
import { formatCount, formatDate, formatMonth, formatTaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useAuth } from '../../lib/auth';
import { canSeeProjectOverview } from '../roles';
import { CARDS_KEY, programCards } from './cards-api';
import type { Project } from './projects-api';

/** A fact of the list another part of the page may already show. */
export type SessionFact = 'period' | 'program' | 'limit' | 'budget';

/**
 * The facts of a session as a list of labels and values: code, session, period, program,
 * workflow, window, limit and budget, and when it was activated or closed (the summary of a
 * session and the review step of the setup). The program's name comes from the cards, which an
 * RPM reads too. `leave` drops the facts the page already shows elsewhere, so each is said once.
 */
export function ProjectFacts({
  project: p,
  leave = [],
}: {
  project: Project;
  leave?: readonly SessionFact[];
}) {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    // read only for the program's name, so not when the page shows the program elsewhere
    enabled: Boolean(me && canSeeProjectOverview(me)) && !leave.includes('program'),
  });
  const program = cards.data?.find((g) => g.id === p.programId);
  const none = t('detail.none');
  const day = (iso: string | null | undefined) => (iso ? formatDate(iso) : none);
  // the optional facts are left out when they are not there
  const facts: { id?: SessionFact; label: string; value: ReactNode; shown?: boolean }[] = [
    { label: t('column.code'), value: p.code },
    { label: t('column.session'), value: p.sessionLabel },
    {
      id: 'period',
      label: t('dialog.period'),
      value: t('period_value', { from: formatMonth(p.periodFrom), to: formatMonth(p.periodTo) }),
    },
    {
      id: 'program',
      label: t('column.program'),
      value: program ? localized(program.name, locale) : '',
      shown: Boolean(program),
    },
    { label: t('dialog.workflow'), value: t(`workflow.${p.workflowKey}`) },
    { label: t('detail.window'), value: `${day(p.applyFrom)} – ${day(p.applyTo)}` },
    {
      id: 'limit',
      label: t('setup.limit'),
      value: p.perVolunteerLimit === null ? none : formatCount(p.perVolunteerLimit, locale),
    },
    {
      id: 'budget',
      label: t('detail.budget'),
      value: p.budgetPlanned ? formatTaka(Number(p.budgetPlanned), locale) : none,
      shown: 'budgetPlanned' in p,
    },
    { label: t('detail.activated'), value: day(p.activatedAt), shown: Boolean(p.activatedAt) },
    { label: t('detail.closed'), value: day(p.closedAt), shown: Boolean(p.closedAt) },
  ];
  return (
    <DescriptionList
      items={facts
        .filter((f) => f.shown !== false && !(f.id && leave.includes(f.id)))
        .map(({ label, value }) => ({ label, value }))}
    />
  );
}
