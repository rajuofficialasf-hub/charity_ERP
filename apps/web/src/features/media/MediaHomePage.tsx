import type { AttentionKind } from '@css/shared';
import { type Locale, localized } from '@css/shared/i18n';
import { Button, Card, ErrorState, Grid, Select, Skeleton, StatCard } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ForbiddenContent } from '../../admin/AdminLayout';
import { MEDIA_ROLES, MEDIA_WORK_ROLES } from '../../admin/roles';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { AttentionList } from '../home/AttentionList';
import { MEDIA_KEY, type MediaCounts, mediaSummary } from './media-api';
import { WorksList } from './WorksList';
import './media.css';

const MEDIA_ATTENTION: readonly AttentionKind[] = [
  'media_referrals_new',
  'media_review_waiting',
  'media_sent_back',
  'media_on_hold',
];

const COUNTS: (keyof MediaCounts)[] = [
  'referrals',
  'new',
  'inReview',
  'inProgress',
  'waitingForShooting',
  'inEditing',
  'published',
  'done',
  'rejected',
];

/**
 * The Media Team's home (docs/ui/SCREENS.md, the Media Team home): what waits for the person, the
 * counts overall or of one program, and the referrals and works with their filters. A member sees
 * only the works they are on; the directors everything; a referrer their program or region.
 */
export function MediaHomePage() {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const allowed = !!me?.roles.some((r) => MEDIA_WORK_ROLES.includes(r));
  const summary = useQuery({
    queryKey: [...MEDIA_KEY, 'summary'],
    queryFn: mediaSummary,
    enabled: allowed,
  });
  const [program, setProgram] = useState<string | null>(null);
  if (!allowed) return <ForbiddenContent />;
  const programs = (summary.data?.programs ?? []).map((p) => ({
    id: p.program.id,
    name: localized(p.program.name, locale),
  }));
  const counts =
    (program && summary.data?.programs.find((p) => p.program.id === program)?.counts) ||
    summary.data?.overall;
  const member = !!me?.roles.some((r) => MEDIA_ROLES.includes(r));
  return (
    <Grid gap={4}>
      <DocumentTitle title={t('home.title')} />
      <h1 className="media-title">{t('home.title')}</h1>
      <AttentionList kinds={MEDIA_ATTENTION} />
      <Card
        title={t('home.counts')}
        headingLevel={2}
        actions={
          programs.length > 1 ? (
            <Select
              label={t('home.program')}
              value={program}
              placeholder={t('home.all_programs')}
              options={programs.map((p) => ({ id: p.id, label: p.name }))}
              onChange={setProgram}
            />
          ) : null
        }
      >
        {summary.isPending ? (
          <Skeleton shape="card" />
        ) : summary.error || !counts ? (
          <ErrorState title={tc('state.error.text')} onRetry={() => void summary.refetch()} />
        ) : (
          <div className="media-counts">
            {COUNTS.map((key) => (
              // eslint-disable-next-line security/detect-object-injection -- a typed count key
              <StatCard key={key} label={t(`home.count.${key}`)} value={counts[key]} />
            ))}
          </div>
        )}
      </Card>
      <Card
        title={member ? t('home.my_works') : t('home.works')}
        headingLevel={2}
        actions={
          member && me ? (
            <Button variant="ghost" size="sm" href={`/media/members/${me.id}`}>
              {t('home.portfolio')}
            </Button>
          ) : null
        }
      >
        <WorksList programs={programs} />
      </Card>
    </Grid>
  );
}
