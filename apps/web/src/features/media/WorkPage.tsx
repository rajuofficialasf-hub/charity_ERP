import { Alert, Badge, Breadcrumb, ErrorState, Grid, Skeleton, Stack, Text } from '@css/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { ForbiddenContent } from '../../admin/AdminLayout';
import { MEDIA_WORK_ROLES } from '../../admin/roles';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { MEDIA_KEY, type MediaReferral, mediaReferral, referralKey } from './media-api';
import { MembersEditor } from './MembersEditor';
import { PublicationsPanel } from './PublicationsPanel';
import { ReferralPanel } from './ReferralPanel';
import { ScriptEditor } from './ScriptEditor';
import { StagePanel } from './StagePanel';
import { useMediaLabels } from './use-media-lists';
import { WorkComments, WorkHistory } from './WorkHistory';
import './media.css';

/**
 * One referral and its work on one page (docs/ui/SCREENS.md, the media work page): the referral and
 * the person's allowed details, the decision, then once accepted the stage, the team, the script,
 * the publications, the final review, the comments and the history. Each action shows only to
 * whoever the server says may take it.
 */
export function WorkPage() {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const { referralId = '' } = useParams();
  const { me } = useAuth();
  const labels = useMediaLabels();
  const queryClient = useQueryClient();
  const allowed = !!me?.roles.some((r) => MEDIA_WORK_ROLES.includes(r));
  const one = useQuery({
    queryKey: referralKey(referralId),
    queryFn: () => mediaReferral(referralId),
    enabled: allowed,
  });
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  if (!allowed) return <ForbiddenContent />;
  const saved = (next: MediaReferral, text: string) => {
    queryClient.setQueryData(referralKey(referralId), next);
    void queryClient.invalidateQueries({ queryKey: MEDIA_KEY, exact: false });
    setNotice({ tone: 'success', text });
  };
  // someone changed the work meanwhile: the page reads it again and says so
  const stale = () => {
    void one.refetch();
    setNotice({ tone: 'warning', text: t('work.stale') });
  };
  const crumbs = [{ id: 'media', label: t('work.breadcrumb'), href: '/media' }];
  if (one.isPending) return <Skeleton shape="card" />;
  if (one.error || !one.data)
    return (
      <Stack gap={2}>
        <Breadcrumb items={crumbs} />
        <ErrorState
          title={tc('state.error.text')}
          requestId={one.error instanceof ApiFailure ? one.error.requestId : undefined}
          onRetry={() => void one.refetch()}
        />
      </Stack>
    );
  const r = one.data;
  const work = r.work;
  const title = work?.title ?? r.beneficiaryName;
  return (
    <Grid gap={3}>
      <DocumentTitle title={title} />
      <Breadcrumb items={[...crumbs, { id: 'work', label: title }]} />
      <Stack gap={1}>
        <h1 className="media-title">{title}</h1>
        <Stack direction="row" gap={2} wrap>
          <Badge
            tone="info"
            label={
              work
                ? t('work.stage_now', { stage: labels.stage(work.stageCode) })
                : t(`state.${r.state}`)
            }
          />
          <Badge
            tone={r.priority === 'high' ? 'warning' : 'neutral'}
            label={t(`priority.${r.priority}`)}
          />
        </Stack>
      </Stack>
      {notice ? (
        <Alert tone={notice.tone} live="status" onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      ) : null}
      <ReferralPanel referral={r} onSaved={saved} />
      {work ? (
        <>
          <StagePanel key={work.version} work={work} onSaved={saved} onStale={stale} />
          <MembersEditor work={work} onSaved={saved} onStale={stale} />
          <ScriptEditor work={work} onSaved={saved} onStale={stale} />
          <PublicationsPanel work={work} onSaved={saved} />
          <WorkComments work={work} onSaved={saved} />
        </>
      ) : (
        <Text tone="muted">{t('work.not_started')}</Text>
      )}
      <WorkHistory history={r.history} />
    </Grid>
  );
}
