import { DescriptionList } from '@/ui';
import { formatCount, formatDate, formatTaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useAuth } from '../../lib/auth';
import { canSeeProjectOverview } from '../roles';
import { CARDS_KEY, programCards } from './cards-api';
import type { Project } from './projects-api';

/**
 * The facts of a session as a list of labels and values: code, session, period, program,
 * workflow, window, limit and budget, and when it was activated or closed (the project overview
 * and the review step of the setup). The program's name comes from the cards, which an RPM reads
 * too.
 */
export function ProjectFacts({ project: p }: { project: Project }) {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const cards = useQuery({
    queryKey: [...CARDS_KEY, 'programs'],
    queryFn: programCards,
    enabled: Boolean(me && canSeeProjectOverview(me)),
  });
  const program = cards.data?.find((g) => g.id === p.programId);
  const month = (yyyymm: string) => `${yyyymm.slice(5, 7)}-${yyyymm.slice(0, 4)}`;
  const none = t('detail.none');
  const day = (iso: string | null | undefined) => (iso ? formatDate(iso) : none);
  // the optional facts are left out when they are not there
  const facts: { label: string; value: ReactNode; shown?: boolean }[] = [
    { label: t('column.code'), value: p.code },
    { label: t('column.session'), value: p.sessionLabel },
    { label: t('dialog.period'), value: `${month(p.periodFrom)} – ${month(p.periodTo)}` },
    {
      label: t('column.program'),
      value: program ? localized(program.name, locale) : '',
      shown: Boolean(program),
    },
    { label: t('dialog.workflow'), value: t(`workflow.${p.workflowKey}`) },
    { label: t('detail.window'), value: `${day(p.applyFrom)} – ${day(p.applyTo)}` },
    {
      label: t('setup.limit'),
      value: p.perVolunteerLimit === null ? none : formatCount(p.perVolunteerLimit, locale),
    },
    {
      label: t('detail.budget'),
      value: p.budgetPlanned ? formatTaka(Number(p.budgetPlanned), locale) : none,
      shown: 'budgetPlanned' in p,
    },
    { label: t('detail.activated'), value: day(p.activatedAt), shown: Boolean(p.activatedAt) },
    { label: t('detail.closed'), value: day(p.closedAt), shown: Boolean(p.closedAt) },
  ];
  return (
    <DescriptionList
      items={facts.filter((f) => f.shown !== false).map(({ label, value }) => ({ label, value }))}
    />
  );
}
