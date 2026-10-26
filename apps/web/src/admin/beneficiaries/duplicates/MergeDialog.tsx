import { Alert, ConfirmDialog } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { ReasonDialog } from '../../projects/ReasonDialog';
import { executeMerge, mergeDirect, type MergeView, proposeMerge } from './merge-api';

/** How the pair is merged: at once, as a proposal, or by carrying out a proposal. */
export type MergeMode = 'direct' | 'propose' | 'execute';

/** The record kinds a merge refuses on when both profiles hold the same one. */
const CLASH_KINDS = [
  'class_attendance',
  'learning_progress',
  'exam_results',
  'file_links',
  'alerts',
] as const;

/**
 * What a refused merge names: the projects with an application still waiting for a decision
 * (by name where the caller reaches the project) and the records both profiles hold.
 */
export function ConflictList({
  error,
  projectName,
}: {
  error: unknown;
  projectName: (id: string) => string | undefined;
}) {
  const t = useTranslations('admin.beneficiaries.merge.conflict');
  if (!(error instanceof ApiFailure) || error.code !== 'beneficiary.merge_conflict') return null;
  const lines = error.details.map((d) => {
    const kind = d.path?.split('.')[0] ?? '';
    if (kind === 'applications') {
      const id = d.params?.projectId;
      return id
        ? t('application', { project: projectName(id) ?? t('project_unknown') })
        : t('hidden');
    }
    const clash = CLASH_KINDS.find((k) => k === kind);
    return clash ? t(clash) : t('other');
  });
  const unique = [...new Set(lines)];
  if (!unique.length) return null;
  return (
    <ul>
      {unique.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * Asks for the reason of a merge or a proposal and sends it; carrying out a proposal only confirms,
 * its reason was given when it was proposed. A refusal stays in the dialog with what it names.
 */
export function MergeDialog({
  mode,
  kept,
  merged,
  proposalId,
  projectName,
  onDone,
  onClose,
}: {
  mode: MergeMode;
  kept: { id: string; benNo: string };
  merged: { id: string; benNo: string };
  /** The proposal carried out (mode execute). */
  proposalId?: string;
  projectName: (id: string) => string | undefined;
  onDone: (view: MergeView) => void;
  onClose: () => void;
}) {
  const t = useTranslations('admin.beneficiaries.merge');
  const send = useMutation({
    mutationFn: (reason: string) => {
      if (mode === 'execute') return executeMerge(proposalId ?? '', kept.id);
      const body = { keptId: kept.id, mergedId: merged.id, reason };
      return mode === 'direct' ? mergeDirect(body) : proposeMerge(body);
    },
    onSuccess: onDone,
  });
  const names = { kept: kept.benNo, merged: merged.benNo };
  const details = <ConflictList error={send.error} projectName={projectName} />;
  if (mode === 'execute')
    return (
      <ConfirmDialog
        isOpen
        title={t('execute_title', names)}
        message={
          send.error instanceof ApiFailure ? (
            <Alert tone="danger" live="alert">
              {send.error.message}
              {details}
            </Alert>
          ) : undefined
        }
        confirmLabel={t('merge')}
        pending={send.isPending}
        onConfirm={() => send.mutate('')}
        onCancel={onClose}
      />
    );
  return (
    <ReasonDialog
      title={t(mode === 'direct' ? 'merge_title' : 'propose_title', names)}
      confirm={t(mode === 'direct' ? 'merge' : 'propose')}
      pending={send.isPending}
      error={send.error}
      errorDetails={details}
      onConfirm={({ reason }) => send.mutate(reason)}
      onClose={onClose}
    />
  );
}
