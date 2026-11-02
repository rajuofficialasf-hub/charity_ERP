import { Card, DescriptionList, ErrorState, Grid, Skeleton, StatCard, Stack, Text } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { ForbiddenContent } from '../../admin/AdminLayout';
import { MEDIA_WORK_ROLES } from '../../admin/roles';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { MEDIA_KEY, mediaMember } from './media-api';
import { MediaWorksSection } from './MediaWorksSection';
import './media.css';
import { PageCrumbs } from '../../components/shell/breadcrumb';

const ROLE_KEYS = ['media_team', 'media_director', 'media_assistant_director'] as const;
type MediaRole = (typeof ROLE_KEYS)[number];
const isMediaRole = (role: string): role is MediaRole =>
  (ROLE_KEYS as readonly string[]).includes(role);

/**
 * A Media Team member's profile (docs/ui/SCREENS.md, the member profile): the designation and the
 * contact (for the team only), the counts, and the portfolio of published works with the member's
 * own production roles; a work of several members shows on each one's page.
 */
export function MemberPage() {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const { userId = '' } = useParams();
  const { me } = useAuth();
  const allowed = !!me?.roles.some((r) => MEDIA_WORK_ROLES.includes(r));
  const member = useQuery({
    queryKey: [...MEDIA_KEY, 'member', userId],
    queryFn: () => mediaMember(userId),
    enabled: allowed,
  });
  if (!allowed) return <ForbiddenContent />;
  const crumbs = [{ id: 'media', label: t('work.breadcrumb'), href: '/media' }];
  if (member.isPending) return <Skeleton shape="card" />;
  if (member.error || !member.data)
    return (
      <Stack gap={2}>
        <PageCrumbs items={crumbs} />
        <ErrorState
          title={tc('state.error.text')}
          requestId={member.error instanceof ApiFailure ? member.error.requestId : undefined}
          onRetry={() => void member.refetch()}
        />
      </Stack>
    );
  const m = member.data;
  const roles = m.roles.filter(isMediaRole).map((r) => t(`member.role.${r}`));
  return (
    <Grid gap={3}>
      <DocumentTitle title={m.name} />
      <PageCrumbs items={[...crumbs, { id: 'member', label: m.name }]} />
      <Stack gap={1}>
        <h1 className="media-title">{m.name}</h1>
        <Text tone="muted">{[m.designation, ...roles].filter(Boolean).join(' · ')}</Text>
      </Stack>
      {m.mobile || m.email ? (
        <Card title={t('member.contact')} headingLevel={2}>
          <DescriptionList
            labelWidth="sm"
            items={[
              ...(m.mobile ? [{ label: t('member.mobile'), value: m.mobile }] : []),
              ...(m.email ? [{ label: t('member.email'), value: m.email }] : []),
            ]}
          />
        </Card>
      ) : null}
      <div className="media-counts">
        <StatCard label={t('member.works')} value={m.counts.works} />
        <StatCard label={t('member.published')} value={m.counts.published} />
      </div>
      <Card title={t('member.portfolio')} headingLevel={2}>
        <Stack gap={2}>
          <Text as="small" tone="muted">
            {t('member.portfolio_hint')}
          </Text>
          <MediaWorksSection works={m.portfolio} emptyText={t('member.empty')} />
        </Stack>
      </Card>
    </Grid>
  );
}
