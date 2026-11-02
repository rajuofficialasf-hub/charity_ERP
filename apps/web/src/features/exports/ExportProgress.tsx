import { Alert, Button, ProgressBar, Spinner, Stack, Text } from '@css/ui';
import { Download, RotateCcw } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { failureKey } from './exports-api';
import { useDownload } from './use-download';
import { useExportJob } from './use-export-job';

interface ExportProgressProps {
  jobId: string;
  /** Back to the choice, to start the export again after a failure. */
  onRetry?: () => void;
}

/**
 * One export as it goes: waiting, then running with the rows written of the total, then the
 * download; a failure says why and offers to start again. The job runs on whether this stays open.
 */
export function ExportProgress({ jobId, onRetry }: ExportProgressProps) {
  const t = useTranslations('exports.dialog');
  const te = useTranslations('errors');
  const job = useExportJob(jobId);
  const { save, saving, saveFailed } = useDownload();
  const data = job.data;

  if (!data && job.isError)
    return (
      <Stack gap={2}>
        <Alert tone="danger">{t('unreadable')}</Alert>
        <Button variant="secondary" icon={RotateCcw} onPress={() => void job.refetch()}>
          {t('retry')}
        </Button>
      </Stack>
    );

  return (
    <Stack gap={3}>
      {!data || data.status === 'queued' ? (
        <Stack direction="row" gap={2} align="center">
          <Spinner size="sm" />
          <Text>{t('queued')}</Text>
        </Stack>
      ) : data.status === 'running' ? (
        <ProgressBar
          label={t('running')}
          value={data.rowsDone}
          max={Math.max(data.rowsTotal ?? data.rowsDone, 1)}
          showValue
        />
      ) : data.status === 'done' ? (
        <Stack gap={2}>
          <Alert tone="success" live="status">
            {t('done')}
          </Alert>
          {data.sensitive && <Text tone="muted">{t('sensitive_note')}</Text>}
          {data.fileId && (
            <Button icon={Download} loading={saving} onPress={() => void save(data)}>
              {t('download')}
            </Button>
          )}
          {saveFailed && <Alert tone="danger">{t('download_failed')}</Alert>}
        </Stack>
      ) : (
        <Stack gap={2}>
          <Alert tone="danger" title={t('failed')}>
            {te(failureKey(data.errorCode))}
          </Alert>
          {onRetry && (
            <Button variant="secondary" icon={RotateCcw} onPress={onRetry}>
              {t('retry')}
            </Button>
          )}
        </Stack>
      )}
      {(!data || data.status === 'queued' || data.status === 'running') && (
        <Text tone="muted">{t('background_note')}</Text>
      )}
    </Stack>
  );
}
