import { Button, ConfirmDialog } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FilePenLine, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { VOLUNTEERS_KEY } from '../volunteers/volunteers-api';
import { CorrectionDialog } from './CorrectionDialog';
import { approve, detailKey, LIST_KEY, reject } from './registrations-api';
import type { ListNotice } from './RegistrationsPage';

/** What the server allows on this volunteer (the volunteer profile's action flags). */
export interface DecisionFlags {
  review: boolean;
  approve: boolean;
  requestCorrection: boolean;
}

/**
 * The decisions on a pending volunteer registration: approve, ask for a correction, reject, each
 * with its dialog. A button shows only for an allowed action (without flags the caller's role
 * decided, as the older review did); approval waits while a correction or a block holds the
 * registration. The server checks permission and scope again on every action.
 */
export function VolunteerDecisions({
  userId,
  name,
  inCorrection,
  blocklisted,
  allowed,
  finishedTo,
  onChanged,
}: {
  userId: string;
  name: string;
  inCorrection: boolean;
  blocklisted: boolean;
  allowed?: DecisionFlags;
  /** Where a final decision leads, with its message (the registration has left the list). */
  finishedTo: string;
  /** A correction was asked for: the page shows the message and refreshes. */
  onChanged: (message: string) => void;
}) {
  const t = useTranslations('admin.registrations');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'approve' | 'reject' | 'correct' | null>(null);
  // the volunteer tab and its profiles show the same people, so their answers go stale too
  const stale = () => {
    void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    void queryClient.invalidateQueries({ queryKey: VOLUNTEERS_KEY });
  };
  const finished = (message: string) => {
    stale();
    void navigate(finishedTo, { state: { notice: message } satisfies ListNotice });
  };
  const approval = useMutation({
    mutationFn: () => approve(userId),
    onSuccess: () => finished(t('approved')),
  });
  const rejection = useMutation({
    mutationFn: (reason: string) => reject(userId, reason.trim()),
    onSuccess: () => finished(t('rejected')),
  });
  const decisionError = [approval.error, rejection.error].find((e) => e instanceof ApiFailure) as
    ApiFailure | undefined;
  const close = () => {
    approval.reset();
    rejection.reset();
    setDialog(null);
  };
  if (allowed && !allowed.review) return null;
  return (
    <>
      <Button
        icon={Check}
        disabled={blocklisted || inCorrection || (allowed && !allowed.approve)}
        onPress={() => setDialog('approve')}
      >
        {t('approve')}
      </Button>
      <Button
        variant="secondary"
        icon={FilePenLine}
        disabled={allowed && !allowed.requestCorrection}
        onPress={() => setDialog('correct')}
      >
        {t('correct')}
      </Button>
      <Button variant="secondary" icon={X} onPress={() => setDialog('reject')}>
        {t('reject')}
      </Button>
      <ConfirmDialog
        isOpen={dialog === 'approve'}
        title={t('approve_title', { name })}
        message={
          <>
            {t('approve_body')}
            {decisionError && <p className="admin-error">{decisionError.message}</p>}
          </>
        }
        confirmLabel={t('approve_confirm')}
        pending={approval.isPending}
        onConfirm={() => approval.mutate()}
        onCancel={close}
      />
      <ConfirmDialog
        isOpen={dialog === 'reject'}
        title={t('reject_title', { name })}
        message={decisionError && <p className="admin-error">{decisionError.message}</p>}
        tone="danger"
        reasonRequired
        reasonLabel={t('reason')}
        confirmLabel={t('reject_confirm')}
        pending={rejection.isPending}
        onConfirm={(reason) => rejection.mutate(reason)}
        onCancel={close}
      />
      <CorrectionDialog
        userId={userId}
        isOpen={dialog === 'correct'}
        onClose={close}
        onDone={() => {
          setDialog(null);
          void queryClient.invalidateQueries({ queryKey: detailKey(userId) });
          stale();
          onChanged(t('corrected'));
        }}
      />
    </>
  );
}
