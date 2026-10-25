import { uuidv7 } from '@css/shared';
import { formatCount } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Badge, Button, Card, ProgressBar, Stack, Text } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { type Quota, quotas as loadQuotas } from '../projects/setup/setup-api';
import { canDecideApplications } from '../roles';
import { APPLICATIONS_KEY, askedComments, type CommentReason, pullNext } from './applications-api';
import { DecisionDialog } from './DecisionDialog';

/** The union and the district the list is filtered to, from the address. */
export interface AreaFilter {
  unionId?: string;
  districtId?: string;
}

/**
 * The quota areas of a project above its applications: each place's target, the applications
 * received and approved, a full quota marked (it only warns, never refuses), and "পরেরজনকে আনুন"
 * for each area the project weighs by. A project without quotas weighs as a whole and has one
 * pull; an area without a target of its own is pulled from once the list is filtered to it.
 */
export function QuotaBars({ projectId, area }: { projectId: string; area: AreaFilter }) {
  const t = useTranslations('applications.office');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const decide = Boolean(me && canDecideApplications(me));
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: [...APPLICATIONS_KEY, projectId, 'quotas'],
    queryFn: () => loadQuotas(projectId),
  });
  const [asking, setAsking] = useState<{ areaId?: string; reasons: CommentReason[] } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const failure = (error: unknown) =>
    error instanceof ApiFailure ? error.message : tc('state.error.text');
  const pull = useMutation({
    // every click is its own request, so a pull refused for a missing comment is sent anew
    mutationFn: (input: { areaId?: string; comment?: string }) =>
      pullNext(projectId, uuidv7(), {
        ...(input.areaId ? { areaId: input.areaId } : {}),
        ...(input.comment ? { comment: input.comment } : {}),
      }),
    onSuccess: async (out) => {
      setAsking(null);
      setNotice({ tone: 'success', text: t('pull.done', { appNo: out.data.appNo ?? '' }) });
      await queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
    },
    onError: (error, input) => {
      const reasons = askedComments(error);
      if (reasons?.length) {
        setAsking({ areaId: input.areaId, reasons });
        return;
      }
      // the comment dialog shows its own failure and keeps the comment typed
      if (asking) return;
      setNotice({ tone: 'danger', text: failure(error) });
    },
  });
  if (list.isPending || list.error) return null;
  const rows = list.data;
  const level = rows.some((q) => q.level === 'union')
    ? 'union'
    : rows.some((q) => q.level === 'district')
      ? 'district'
      : null;
  const filtered =
    level === 'union' ? area.unionId : level === 'district' ? area.districtId : undefined;
  const untargeted =
    filtered && !rows.some((q) => q.level === level && q.locationId === filtered)
      ? filtered
      : undefined;
  const start = (areaId?: string) => {
    setNotice(null);
    pull.mutate({ areaId });
  };
  const dialog = asking ? (
    <DecisionDialog
      title={t('pull.title')}
      confirm={t('pull.title')}
      withReason={false}
      comments={asking.reasons}
      pending={pull.isPending}
      error={pull.error && !askedComments(pull.error) ? failure(pull.error) : null}
      onConfirm={({ comment }) => pull.mutate({ areaId: asking.areaId, comment })}
      onClose={() => {
        pull.reset();
        setAsking(null);
      }}
    />
  ) : null;
  const shown = notice ? (
    <Alert tone={notice.tone} live="status" onDismiss={() => setNotice(null)}>
      {notice.text}
    </Alert>
  ) : null;
  if (!rows.length)
    return decide ? (
      <Stack gap={2}>
        {shown}
        <Stack direction="row" gap={2} wrap className="admin-pull-bar">
          <Text tone="muted">{t('pull.help')}</Text>
          <Button variant="secondary" size="sm" loading={pull.isPending} onPress={() => start()}>
            {t('pull.title')}
          </Button>
        </Stack>
        {dialog}
      </Stack>
    ) : null;
  return (
    <Stack gap={2}>
      {shown}
      <Card
        title={t('quotas.title')}
        subtitle={decide ? t('pull.help') : undefined}
        headingLevel={2}
      >
        <ul className="admin-quota-list">
          {rows.map((q) => (
            <QuotaRow
              key={q.locationId}
              quota={q}
              locale={locale}
              pull={
                decide && q.level === level
                  ? (name) => (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={pull.isPending && pull.variables?.areaId === q.locationId}
                        onPress={() => start(q.locationId)}
                      >
                        {t('pull.area', { name })}
                      </Button>
                    )
                  : null
              }
            />
          ))}
        </ul>
        {decide && untargeted ? (
          <UntargetedPull
            areaId={untargeted}
            pending={pull.isPending}
            onPull={() => start(untargeted)}
          />
        ) : null}
      </Card>
      {dialog}
    </Stack>
  );
}

/** One quota: the place, its figures, a bar of the approvals against the target, and its pull. */
function QuotaRow({
  quota,
  locale,
  pull,
}: {
  quota: Quota;
  locale: Locale;
  pull: ((name: string) => ReactNode) | null;
}) {
  const t = useTranslations('applications.office.quotas');
  const name = localized(quota.locationName, locale);
  return (
    <li className="admin-quota-row">
      <div className="admin-quota-head">
        <strong>{name}</strong>
        <Text tone="muted">{t(`level.${quota.level}`)}</Text>
        {quota.full ? <Badge tone="warning" label={t('full')} /> : null}
      </div>
      <Text>
        {t('progress', {
          target: formatCount(quota.target, locale),
          received: formatCount(quota.received, locale),
          approved: formatCount(quota.approved, locale),
        })}
      </Text>
      <ProgressBar
        value={quota.approved}
        max={quota.target}
        label={t('bar', { name })}
        showValue={false}
        size="sm"
        tone={quota.full ? 'warning' : 'brand'}
      />
      {pull ? <div>{pull(name)}</div> : null}
    </li>
  );
}

/** The pull of the area the list is filtered to, when that area has no target of its own. */
function UntargetedPull({
  areaId,
  pending,
  onPull,
}: {
  areaId: string;
  pending: boolean;
  onPull: () => void;
}) {
  const t = useTranslations('applications.office.pull');
  const locale = useLocale() as Locale;
  const name = useLocationName(undefined, areaId)?.[locale] ?? '';
  return (
    <div>
      <Button variant="secondary" size="sm" loading={pending} onPress={onPull}>
        {t('area', { name })}
      </Button>
    </div>
  );
}
