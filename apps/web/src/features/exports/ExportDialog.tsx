import type { ExportFormat, ExportList } from '@css/shared/exports';
import { Alert, Button, Modal, RadioGroup, Skeleton, Stack, Text } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { ColumnPicker } from './ColumnPicker';
import { ExportProgress } from './ExportProgress';
import { EXPORTS_KEY, exportColumns, startExport } from './exports-api';
import { rememberColumns, rememberedColumns } from './remembered-columns';

export interface ExportDialogProps {
  list: ExportList;
  /** The application list's project. */
  projectId?: string;
  /** The list's filters and search as the page holds them now. */
  filters: Record<string, string | undefined>;
  onClose: () => void;
}

const FORMATS: ExportFormat[] = ['xlsx', 'csv', 'pdf'];
const FORMAT_LABELS = new Map<ExportFormat, string>([
  ['xlsx', 'Excel'],
  ['csv', 'CSV'],
  ['pdf', 'PDF'],
]);

/**
 * The export dialog of a list: the file type and the columns, the on-screen ones
 * ticked the first time and the person's last choice after that; once started, the job's
 * progress and its download. The rows are the list's as the page shows them now.
 */
export default function ExportDialog({ list, projectId, filters, onClose }: ExportDialogProps) {
  const t = useTranslations('exports.dialog');
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [chosen, setChosen] = useState<string[] | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const columns = useQuery({
    queryKey: [...EXPORTS_KEY, 'columns', list, projectId ?? null],
    queryFn: () => exportColumns(list, projectId),
  });
  // the first time the columns arrive, the remembered or on-screen ones are ticked
  const picked = chosen ?? (columns.data ? rememberedColumns(list, columns.data) : []);

  const start = useMutation({
    mutationFn: () => {
      const ids = picked;
      rememberColumns(list, ids);
      const set = Object.fromEntries(
        Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
      return startExport({
        kind: list,
        format,
        columns: ids,
        filters: set,
        ...(projectId ? { projectId } : {}),
      });
    },
    onSuccess: (job) => {
      setJobId(job.id);
      void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY });
    },
  });
  const failure = start.error instanceof ApiFailure ? start.error : null;
  const none = picked.length === 0;
  const title = t('title', { list: t(`list.${list}`) });

  if (jobId)
    return (
      <Modal
        title={title}
        isOpen
        onClose={onClose}
        secondaryAction={
          <Button variant="secondary" onPress={onClose}>
            {t('close')}
          </Button>
        }
      >
        <ExportProgress
          jobId={jobId}
          onRetry={() => {
            setJobId(null);
            start.reset();
          }}
        />
      </Modal>
    );

  return (
    <Modal
      title={title}
      size="lg"
      fullOnPhone
      isOpen
      onClose={onClose}
      dismissible={!start.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose}>
          {t('close')}
        </Button>
      }
      primaryAction={
        <Button
          disabled={none || !columns.data}
          loading={start.isPending}
          onPress={() => start.mutate()}
        >
          {t('start')}
        </Button>
      }
    >
      <Stack gap={4}>
        <Text tone="muted">{t('filters_note')}</Text>
        <RadioGroup
          label={t('format')}
          orientation="horizontal"
          options={FORMATS.map((f) => ({ id: f, label: FORMAT_LABELS.get(f) ?? f }))}
          value={format}
          onChange={(id) => setFormat(id as ExportFormat)}
          {...(format === 'pdf' ? { helper: t('format_pdf_hint') } : {})}
        />
        {columns.isPending ? (
          <Skeleton shape="row" count={4} />
        ) : columns.error ? (
          <Alert tone="danger">{t('load_failed')}</Alert>
        ) : (
          <ColumnPicker columns={columns.data} value={picked} onChange={(ids) => setChosen(ids)} />
        )}
        {none && columns.data && <Text tone="muted">{t('none_chosen')}</Text>}
        {failure && (
          <Alert tone="danger" live="alert">
            {failure.message}
          </Alert>
        )}
      </Stack>
    </Modal>
  );
}
