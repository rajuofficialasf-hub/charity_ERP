import { formatCount, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  ProgressBar,
  Skeleton,
  Stack,
  Text,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { ForbiddenContent } from '../../admin/AdminLayout';
import { canExport } from '../../admin/roles';
import { AccountPage } from '../../components/AccountPage';
import { useAuth } from '../../lib/auth';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { EXPORTS_KEY, type ExportJob, failureKey, myExports } from './exports-api';
import { useDownload } from './use-download';
import './exports.css';

/** How often the list is asked again while one of its exports waits or runs. */
const POLL_MS = 3000;

/**
 * My exports: the person's own exports of the last 30 days, their state and their download; for
 * whoever may export, as the profile menu offers it.
 */
export function MyExportsPage() {
  const t = useTranslations('exports.mine');
  const { me } = useAuth();
  // a volunteer never exports, so the page is not theirs, as the menu says (the API refuses too)
  if (me && !canExport(me)) return <ForbiddenContent />;
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
      <LoadError title={t('load_failed')} error={jobs.error} onRetry={() => void jobs.refetch()} />
    );
  if (jobs.data.length === 0)
    return <EmptyState title={t('empty')} description={t('empty_hint')} />;
  return (
    <Stack gap={3}>
      <Text tone="muted">{t('intro')}</Text>
      <ul className="my-exports-list">
        {jobs.data.map((job) => (
          <li key={job.id}>
            <ExportRow job={job} />
          </li>
        ))}
      </ul>
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
    queued: { tone: 'info' as const, icon: 'clock' as const },
    running: { tone: 'info' as const, icon: 'hourglass' as const },
    done: { tone: 'success' as const, icon: 'success' as const },
    failed: { tone: 'error' as const, icon: 'rejected' as const },
    expired: { tone: 'neutral' as const, icon: 'clock' as const },
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
          <Chip tone={badge.tone}>
            <Icon name={badge.icon} size={16} />
            {t(`state.${state}`)}
          </Chip>
          <Text tone="muted">{facts.join(' · ')}</Text>
        </Stack>
        {job.status === 'running' && (
          <ProgressBar
            label={td('running')}
            value={job.rowsDone}
            max={Math.max(job.rowsTotal ?? job.rowsDone, 1)}
            showValue
            size="small"
          />
        )}
        {job.status === 'failed' && <Text tone="muted">{te(failureKey(job.errorCode))}</Text>}
        {job.expired && <Text tone="muted">{t('expired_note')}</Text>}
        {job.status === 'done' && !job.expired && job.fileId && (
          <Stack direction="row">
            <Button
              variant="secondary"
              size="small"
              startIcon="download"
              loading={saving}
              onClick={() => void save(job)}
            >
              {td('download')}
            </Button>
          </Stack>
        )}
        {saveFailed && <Alert tone="error">{td('download_failed')}</Alert>}
      </Stack>
    </Card>
  );
}
