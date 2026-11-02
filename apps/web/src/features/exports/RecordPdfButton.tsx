import { Alert, Button, Modal } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { canExport, canPrintProfile } from '../../admin/roles';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ExportProgress } from './ExportProgress';
import { EXPORTS_KEY, startRecordPdf } from './exports-api';

interface RecordPdfButtonProps {
  kind: 'beneficiary_profile' | 'application';
  id: string;
}

/**
 * "Download PDF" on a beneficiary's profile (the journey report's roles) and on an application
 * (the lists' export roles): starts the record's PDF and follows it in a dialog. The server
 * checks the permission, the record's reach and every protected field again.
 */
export function RecordPdfButton({ kind, id }: RecordPdfButtonProps) {
  const t = useTranslations('exports.dialog');
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const start = useMutation({
    mutationFn: () => startRecordPdf(kind, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: EXPORTS_KEY }),
  });
  const allowed = me && (kind === 'beneficiary_profile' ? canPrintProfile(me) : canExport(me));
  // a request still on its way is kept: forgetting it would let a second press start another job
  const close = () => {
    setOpen(false);
    if (!start.isPending) start.reset();
  };
  if (!allowed) return null;
  const failure = start.error instanceof ApiFailure ? start.error : null;
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={FileText}
        loading={start.isPending}
        onPress={() => {
          setOpen(true);
          // a job already started is followed again rather than started twice
          if (!start.isPending && !start.data) start.mutate();
        }}
      >
        {t('pdf')}
      </Button>
      {open && (
        <Modal
          title={t('pdf_title', { list: t(`list.${kind}`) })}
          isOpen
          onClose={close}
          secondaryAction={
            <Button variant="secondary" onPress={close}>
              {t('close')}
            </Button>
          }
        >
          {start.data ? (
            <ExportProgress jobId={start.data.id} onRetry={() => start.mutate()} />
          ) : failure ? (
            <Alert tone="danger" title={t('pdf_failed')}>
              {failure.message}
            </Alert>
          ) : null}
        </Modal>
      )}
    </>
  );
}
