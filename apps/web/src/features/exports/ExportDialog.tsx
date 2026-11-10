import { EXPORT_FORMATS, type ExportFormat, type ExportList } from '@css/shared/exports';
import { Alert, Button, Dialog, Form, RadioGroup, Skeleton, Stack, Text } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useSchemaResolver } from '../../lib/form-schema';
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

const FORMAT_LABELS = new Map<ExportFormat, string>([
  ['xlsx', 'Excel'],
  ['csv', 'CSV'],
  ['pdf', 'PDF'],
]);

/** The file type, and the columns once the person changes them (none yet: the remembered ones). */
const EXPORT_SCHEMA = z.object({
  format: z.enum(EXPORT_FORMATS),
  columns: z.array(z.string()).nullable(),
});
type ExportFields = z.infer<typeof EXPORT_SCHEMA>;

/**
 * The export dialog of a list: the file type and the columns, the on-screen ones
 * ticked the first time and the person's last choice after that; once started, the job's
 * progress and its download. The rows are the list's as the page shows them now.
 */
export default function ExportDialog({ list, projectId, filters, onClose }: ExportDialogProps) {
  const t = useTranslations('exports.dialog');
  const queryClient = useQueryClient();
  const form = useForm<ExportFields>({
    resolver: useSchemaResolver(EXPORT_SCHEMA),
    defaultValues: { format: 'xlsx', columns: null },
    reValidateMode: 'onSubmit',
  });
  const chosen = useWatch({ control: form.control, name: 'columns' });
  const [jobId, setJobId] = useState<string | null>(null);
  const columns = useQuery({
    queryKey: [...EXPORTS_KEY, 'columns', list, projectId ?? null],
    queryFn: () => exportColumns(list, projectId),
  });
  // the first time the columns arrive, the remembered or on-screen ones are ticked
  const picked = chosen ?? (columns.data ? rememberedColumns(list, columns.data) : []);

  const start = useMutation({
    mutationFn: ({ format: as, ids }: { format: ExportFormat; ids: string[] }) => {
      rememberColumns(list, ids);
      const set = Object.fromEntries(
        Object.entries(filters).filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
      return startExport({
        kind: list,
        format: as,
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
  // the button's own path: columns chosen, and nothing twice while the start is on its way
  const send = (fields: ExportFields) => {
    if (none || !columns.data || start.isPending) return;
    start.mutate({ format: fields.format, ids: picked });
  };

  if (jobId)
    return (
      <Dialog
        title={title}
        open
        onClose={onClose}
        actions={
          <Button variant="secondary" onClick={onClose}>
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
      </Dialog>
    );

  return (
    <Dialog
      title={title}
      size="large"
      fullScreenOnPhone
      open
      onClose={onClose}
      dismissible={!start.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
          <Button
            disabled={none || !columns.data}
            loading={start.isPending}
            onClick={() => void form.handleSubmit(send)()}
          >
            {t('start')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Text tone="muted">{t('filters_note')}</Text>
        {/* the column picker's question search sits outside the form, so Enter in it starts nothing */}
        <Form form={form} onSubmit={send} label={title} error={failure?.message}>
          <Controller
            control={form.control}
            name="format"
            render={({ field }) => (
              <RadioGroup
                label={t('format')}
                orientation="horizontal"
                options={EXPORT_FORMATS.map((f) => ({
                  value: f,
                  label: FORMAT_LABELS.get(f) ?? f,
                }))}
                value={field.value}
                onChange={(id) => field.onChange(id as ExportFormat)}
                {...(field.value === 'pdf' ? { hint: t('format_pdf_hint') } : {})}
              />
            )}
          />
        </Form>
        {columns.isPending ? (
          <Skeleton shape="row" count={4} />
        ) : columns.error ? (
          <Alert tone="error">{t('load_failed')}</Alert>
        ) : (
          <Controller
            control={form.control}
            name="columns"
            render={({ field }) => (
              <ColumnPicker columns={columns.data} value={picked} onChange={field.onChange} />
            )}
          />
        )}
        {none && columns.data && <Text tone="muted">{t('none_chosen')}</Text>}
      </Stack>
    </Dialog>
  );
}
