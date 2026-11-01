import { formatCount, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  Stack,
  Text,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, Clock, Download, FileDown, Hourglass } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { EXPORTS_KEY, type ExportJob, failureKey, myExports } from './exports-api';
import { useDownload } from './use-download';

/** How often the list is asked again while one of its exports waits or runs. */
const POLL_MS = 3000;

/** My exports: the person's own exports of the last 30 days, their state and their download. */
export function MyExportsPage() {
  const t = useTranslations('exports.mine');
  return (
    <AccountPage title={() => t('title')}>
      {() => (
        <>
          <DocumentTitle title={t('title')} />
          <ExportList />
        </>
      )}
    </AccountPage>
  );
}

function ExportList() {
  const t = useTranslations('exports.mine');
  const jobs = useQuery({
    queryKey: [...EXPORTS_KEY, 'mine'],
    queryFn: myExports,
    refetchInterval: (query) =>
      query.state.data?.some((j) => j.status === 'queued' || j.status === 'running')
        ? POLL_MS
        : false,
  });
  if (jobs.isPending) return <Skeleton shape="row" count={3} />;
  if (jobs.error)
    return (
      <ErrorState
        title={t('load_failed')}
        requestId={jobs.error instanceof ApiFailure ? jobs.error.requestId : undefined}
        onRetry={() => void jobs.refetch()}
      />
    );
  if (jobs.data.length === 0)
    return (
      <EmptyState icon={FileDown} title={t('empty')} message={t('empty_hint')} headingLevel={2} />
    );
  return (
    <Stack gap={3}>
      <Text tone="muted">{t('intro')}</Text>
      <Stack as="ul" gap={3}>
        {jobs.data.map((job) => (
          <li key={job.id}>
            <ExportRow job={job} />
          </li>
        ))}
      </Stack>
    </Stack>
  );
}

function ExportRow({ job }: { job: ExportJob }) {
  const t = useTranslations('exports.mine');
  const td = useTranslations('exports.dialog');
  const te = useTranslations('errors');
  const locale = useLocale() as Locale;
  const { save, saving, saveFailed } = useDownload();
  const state = job.expired ? 'expired' : job.status;
  const badge = {
    queued: { tone: 'info' as const, icon: Clock },
    running: { tone: 'info' as const, icon: Hourglass },
    done: { tone: 'success' as const, icon: CircleCheck },
    failed: { tone: 'danger' as const, icon: CircleX },
    expired: { tone: 'neutral' as const, icon: Clock },
  }[state];
  const facts = [
    job.format.toUpperCase(),
    formatDateTime(new Date(job.createdAt), locale),
    job.rowCount === null ? null : t('rows', { count: formatCount(job.rowCount, locale) }),
  ].filter(Boolean);
  return (
    <Card title={td(`list.${job.kind}`)} headingLevel={2}>
      <Stack gap={2}>
        <Stack direction="row" wrap gap={2} align="center">
          <Badge tone={badge.tone} icon={badge.icon} label={t(`state.${state}`)} />
          <Text as="span" tone="muted">
            {facts.join(' · ')}
          </Text>
        </Stack>
        {job.status === 'running' && (
          <ProgressBar
            label={td('running')}
            value={job.rowsDone}
            max={Math.max(job.rowsTotal ?? job.rowsDone, 1)}
            showValue
            size="sm"
          />
        )}
        {job.status === 'failed' && <Text tone="muted">{te(failureKey(job.errorCode))}</Text>}
        {job.expired && <Text tone="muted">{t('expired_note')}</Text>}
        {job.status === 'done' && !job.expired && job.fileId && (
          <Stack direction="row">
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              loading={saving}
              onPress={() => void save(job)}
            >
              {td('download')}
            </Button>
          </Stack>
        )}
        {saveFailed && <Alert tone="danger">{td('download_failed')}</Alert>}
      </Stack>
    </Card>
  );
}
