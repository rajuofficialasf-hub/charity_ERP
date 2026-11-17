import { formatBenNo } from '@css/shared/beneficiaries';
import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  DescriptionList,
  EmptyState,
  Page,
  RadioGroup,
  Skeleton,
  Stack,
} from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { ThroughVolunteerChip } from '../../../components/PersonMarks';
import { ApiFailure } from '../../../api/client';
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
import {
  candidatePairOf,
  DUPLICATES_KEY,
  DUPLICATES_PATH,
  type MergeView,
  mergeProposal,
} from './merge-api';
import { PairLevelChip } from './PairLevelChip';
import { PageCrumbs } from '../../../components/shell/breadcrumb';
import { LoadError } from '../../../components/LoadError';

/**
 * Two beneficiary profiles side by side (a suggested pair or a proposal), with the pair's level and
 * rules where the suggestions hold it: the official chooses the profile to keep and merges, or
 * proposes the merge when only a proposal is allowed. Where only one
 * of the two has an identity document, that one is the kept profile and the other cannot be chosen.
 * What is offered follows the action flags of both profiles; the server checks scope, reach and the
 * kept profile again.
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
  const locale = useLocale() as Locale;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const first = useQuery(profileQuery(a));
  const second = useQuery(profileQuery(b));
  const proposals = useQuery({
    queryKey: [...DUPLICATES_KEY, 'proposals', proposalId],
    queryFn: () => mergeProposal(proposalId!),
    enabled: proposalId !== null,
  });
  // the suggested pair of the two, if any: a proposal may join two profiles no rule paired
  const pair = useQuery({
    queryKey: [...DUPLICATES_KEY, 'pair', a, b],
    queryFn: () => candidatePairOf(a, b),
    enabled: a !== '' && b !== '' && a !== b,
    retry: false,
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [missingChoice, setMissingChoice] = useState(false);
  const [dialog, setDialog] = useState(false);

  const crumbs = (
    <PageCrumbs
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
      <Page title={tm('title')} documentTitle={false} />
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
        <EmptyState title={tm('not_found')} />
      </>
    );
  if (failed)
    return (
      <>
        {heading}
        <LoadError error={failed.error} onRetry={() => void failed.refetch()} />
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
        <LoadError error={proposals.error} onRetry={() => void proposals.refetch()} />
      </>
    );
  const proposal: MergeView | undefined = proposals.data ?? undefined;
  if (proposalId !== null && !proposal)
    return (
      <>
        {heading}
        <EmptyState title={tm('proposal_missing')} />
      </>
    );

  const sides = [first.data.data, second.data.data] as const;
  // a merge moves no identity number, so the one profile that has a document is the kept one
  const withDocument = sides.filter((p) => p.hasDocument === true);
  const documentKept =
    withDocument.length === 1 && sides.some((p) => p.hasDocument === false)
      ? withDocument[0]!.id
      : null;
  const kept = documentKept ?? chosen ?? proposal?.keptId ?? null;
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
      {pair.data && (
        <DescriptionList
          items={[
            {
              label: t('duplicates.column.level'),
              value: <PairLevelChip level={pair.data.level} />,
            },
            {
              label: t('duplicates.column.rules'),
              value: (
                <span className="admin-badges">
                  {pair.data.matchedOn.map((rule) => (
                    <Chip key={rule} tone="info">
                      {t(`duplicates.rules.${rule}`)}
                    </Chip>
                  ))}
                </span>
              ),
            },
          ]}
        />
      )}
      {sides
        .filter((p) => p.mergedInto)
        .map((p) => (
          <Alert key={p.id} tone="warning">
            {t('profile.merged_into', { benNo: formatBenNo(p.mergedInto!.benNo) })}
          </Alert>
        ))}
      <div className="admin-compare">
        {sides.map((p) => (
          <Card key={p.id} title={p.name} headingLevel={2}>
            <p className="admin-muted">{formatBenNo(p.benNo)}</p>
            <Stack gap={3}>
              {p.isBlocked && <Chip tone="error">{t('blocked')}</Chip>}
              <DescriptionList
                items={[
                  ...('fatherOrHusbandName' in p
                    ? [{ label: t('column.father'), value: p.fatherOrHusbandName }]
                    : []),
                  ...('mobile' in p
                    ? [{ label: t('profile.mobile'), value: p.mobile ?? <ThroughVolunteerChip /> }]
                    : []),
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
                  options={[
                    {
                      value: p.id,
                      label: tm('keep'),
                      disabled: documentKept !== null && documentKept !== p.id,
                    },
                  ]}
                  value={kept === p.id ? p.id : null}
                  error={missingChoice && !kept ? tm('keep_required') : undefined}
                  hint={
                    documentKept !== null && documentKept !== p.id ? tm('keep_document') : undefined
                  }
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
          <Button startIcon="merge" onClick={start}>
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
