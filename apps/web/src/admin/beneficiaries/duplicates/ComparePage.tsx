import { formatBenNo } from '@css/shared/beneficiaries';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  RadioGroup,
  Skeleton,
  Stack,
  PageHeader,
} from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ApiFailure } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { ForbiddenContent } from '../../AdminLayout';
import { canReviewDuplicates } from '../../roles';
import type { HandedNotice } from '../../use-handed-notice';
import {
  BENEFICIARIES_KEY,
  type BeneficiaryProfile,
  beneficiaryProfile,
} from '../beneficiaries-api';
import { BeneficiaryArea } from '../BeneficiaryArea';
import { MergeDialog, type MergeMode } from './MergeDialog';
import { DUPLICATES_KEY, DUPLICATES_PATH, type MergeView, mergeProposals } from './merge-api';

/**
 * Two beneficiary profiles side by side (a suggested pair or a proposal): the official chooses the
 * profile to keep and merges, or proposes the merge when only a proposal is allowed. What is
 * offered follows the action flags of both profiles; the server checks scope and reach again.
 */
export function ComparePage() {
  const { me } = useAuth();
  const [params] = useSearchParams();
  if (!me) return null;
  if (!canReviewDuplicates(me)) return <ForbiddenContent />;
  return (
    <Compare
      a={params.get('a') ?? ''}
      b={params.get('b') ?? ''}
      proposalId={params.get('proposal')}
    />
  );
}

const profileQuery = (id: string) => ({
  queryKey: [...BENEFICIARIES_KEY, 'profile', id],
  queryFn: () => beneficiaryProfile(id),
  retry: false,
  enabled: id !== '',
});

function Compare({ a, b, proposalId }: { a: string; b: string; proposalId: string | null }) {
  const t = useTranslations('admin.beneficiaries');
  const tm = useTranslations('admin.beneficiaries.merge');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const first = useQuery(profileQuery(a));
  const second = useQuery(profileQuery(b));
  const proposals = useQuery({
    queryKey: [...DUPLICATES_KEY, 'proposals'],
    queryFn: mergeProposals,
    enabled: proposalId !== null,
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [missingChoice, setMissingChoice] = useState(false);
  const [dialog, setDialog] = useState(false);

  const crumbs = (
    <Breadcrumb
      items={[
        { id: 'list', label: t('duplicates.title'), href: DUPLICATES_PATH },
        { id: 'compare', label: tm('title') },
      ]}
    />
  );
  const heading = (
    <>
      <DocumentTitle title={tm('title')} />
      {crumbs}
      <PageHeader title={tm('title')} />
    </>
  );
  const failed = [first, second].find((q) => q.error);
  if (
    a === '' ||
    b === '' ||
    a === b ||
    (failed?.error instanceof ApiFailure && failed.error.status === 404)
  )
    return (
      <>
        {heading}
        <EmptyState icon={UserX} title={tm('not_found')} />
      </>
    );
  if (failed)
    return (
      <>
        {heading}
        <ErrorState
          title={tc('state.error.text')}
          requestId={failed.error instanceof ApiFailure ? failed.error.requestId : undefined}
          onRetry={() => void failed.refetch()}
        />
      </>
    );
  if (!first.data || !second.data || (proposalId !== null && proposals.isPending))
    return (
      <>
        {heading}
        <Skeleton count={4} />
      </>
    );

  // a comparison opened for a proposal carries that proposal out or nothing: never a fresh merge
  // without the proposer's reason, which would leave the proposal open
  if (proposalId !== null && proposals.error)
    return (
      <>
        {heading}
        <ErrorState
          title={tc('state.error.text')}
          requestId={proposals.error instanceof ApiFailure ? proposals.error.requestId : undefined}
          onRetry={() => void proposals.refetch()}
        />
      </>
    );
  const proposal: MergeView | undefined = proposals.data?.find((m) => m.id === proposalId);
  if (proposalId !== null && !proposal)
    return (
      <>
        {heading}
        <EmptyState icon={GitMerge} title={tm('proposal_missing')} />
      </>
    );

  const sides = [first.data.data, second.data.data] as const;
  const kept = chosen ?? proposal?.keptId ?? null;
  const live = sides.every((p) => !p.mergedInto);
  const merges = live && sides.every((p) => p.actions.merge);
  const proposes = live && sides.every((p) => p.actions.proposeMerge);
  const mode: MergeMode | null = proposal
    ? merges
      ? 'execute'
      : null
    : merges
      ? 'direct'
      : proposes
        ? 'propose'
        : null;

  const nameOf = (project: { nameBn: string; nameEn: string }) =>
    locale === 'en' ? project.nameEn : project.nameBn;
  const projectNames = new Map(
    sides.flatMap((p) =>
      p.projectsByYear.flatMap((y) => y.projects.map((pr) => [pr.id, nameOf(pr)] as const)),
    ),
  );
  const keptSide = sides.find((p) => p.id === kept);
  const mergedSide = sides.find((p) => p.id !== kept);
  const ref = (p: BeneficiaryProfile) => ({ id: p.id, benNo: formatBenNo(p.benNo) });

  const done = (view: MergeView) => {
    setDialog(false);
    void queryClient.invalidateQueries({ queryKey: BENEFICIARIES_KEY });
    if (mode === 'propose')
      void navigate(DUPLICATES_PATH, { state: { notice: tm('proposed') } satisfies HandedNotice });
    else
      void navigate(`/admin/beneficiaries/${view.keptId}`, {
        state: { notice: tm('merged') } satisfies HandedNotice,
      });
  };
  const start = () => {
    if (!kept) {
      setMissingChoice(true);
      return;
    }
    setDialog(true);
  };

  return (
    <>
      {heading}
      {proposal && <Alert tone="info">{tm('proposal_reason', { reason: proposal.reason })}</Alert>}
      {sides
        .filter((p) => p.mergedInto)
        .map((p) => (
          <Alert key={p.id} tone="warning">
            {t('profile.merged_into', { benNo: formatBenNo(p.mergedInto!.benNo) })}
          </Alert>
        ))}
      <div className="admin-compare">
        {sides.map((p) => (
          <Card key={p.id} title={p.name} subtitle={formatBenNo(p.benNo)} headingLevel={2}>
            <Stack gap={3}>
              {p.isBlocked && <Badge variant="dot" tone="danger" label={t('blocked')} />}
              <DescriptionList
                labelWidth="sm"
                items={[
                  ...('fatherOrHusbandName' in p
                    ? [{ label: t('column.father'), value: p.fatherOrHusbandName }]
                    : []),
                  ...('mobile' in p ? [{ label: t('profile.mobile'), value: p.mobile }] : []),
                  ...('nid' in p
                    ? [{ label: t('profile.nid'), value: p.nid ?? p.birthReg ?? t('none') }]
                    : []),
                  { label: t('column.area'), value: <BeneficiaryArea profile={p} /> },
                  ...('village' in p ? [{ label: t('profile.village'), value: p.village }] : []),
                  ...(p.applications
                    ? [
                        {
                          label: tm('applications'),
                          value: tm('applications_value', {
                            count: formatCount(p.applications.length, locale),
                          }),
                        },
                      ]
                    : []),
                  {
                    label: tm('projects'),
                    value:
                      p.projectsByYear
                        .flatMap((y) => y.projects.map(nameOf))
                        .filter((name, i, all) => all.indexOf(name) === i)
                        .join(', ') || t('none'),
                  },
                ]}
              />
              <Link to={`/admin/beneficiaries/${p.id}`}>{t('action.profile')}</Link>
              {mode && (
                <RadioGroup
                  name="kept-profile"
                  label={formatBenNo(p.benNo)}
                  options={[{ id: p.id, label: tm('keep') }]}
                  value={kept === p.id ? p.id : null}
                  error={missingChoice && !kept ? tm('keep_required') : undefined}
                  onChange={(id) => {
                    setChosen(id);
                    setMissingChoice(false);
                  }}
                />
              )}
            </Stack>
          </Card>
        ))}
      </div>
      {mode && (
        <div>
          <Button icon={GitMerge} onPress={start}>
            {mode === 'propose' ? tm('propose') : tm('merge')}
          </Button>
        </div>
      )}
      {dialog && mode && keptSide && mergedSide && (
        <MergeDialog
          mode={mode}
          kept={ref(keptSide)}
          merged={ref(mergedSide)}
          proposalId={proposal?.id}
          projectName={(id) => projectNames.get(id)}
          onDone={done}
          onClose={() => setDialog(false)}
        />
      )}
    </>
  );
}
